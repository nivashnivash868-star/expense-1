import os
import sqlite3
import hmac
import hashlib
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

DB_PATH = '/Users/nivashnivash/Downloads/finance.db'
SECRET_KEY = b"finance_tracker_super_secure_secret_key_987654321"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    # Set up tables
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            balance REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            desc TEXT NOT NULL,
            category TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL NOT NULL,
            method TEXT DEFAULT 'Bank',
            account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    # Run dynamic DB migration to add 'method' and 'account_id' columns if database already exists
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN method TEXT DEFAULT 'Bank'")
    except sqlite3.OperationalError:
        pass
        
    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL")
    except sqlite3.OperationalError:
        pass

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            target_amount REAL NOT NULL,
            current_amount REAL NOT NULL DEFAULT 0.0,
            target_date TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    ''')
    
    # Migration: add phone_number, avatar, address to users table
    cursor.execute("PRAGMA table_info(users)")
    columns = [col["name"] for col in cursor.fetchall()]
    if "phone_number" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN phone_number TEXT")
    if "avatar" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
    if "address" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN address TEXT")
    if "budget_limit" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN budget_limit REAL DEFAULT 2000.00")

    # Check if we need to seed the default admin account
    cursor.execute("SELECT * FROM users WHERE email = 'admin@example.com'")
    admin = cursor.fetchone()
    
    if not admin:
        admin_pass_hash = generate_password_hash("admin123", method="pbkdf2:sha256")
        cursor.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            ("Admin User", "admin@example.com", admin_pass_hash)
        )
        admin_id = cursor.lastrowid
        
        cursor.execute(
            "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
            (admin_id, "Checking Account (Primary)", "Checking", 0.00)
        )
        checking_id = cursor.lastrowid
        
        cursor.execute(
            "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
            (admin_id, "Savings Vault Ledger", "Savings", 0.00)
        )
        savings_id = cursor.lastrowid
            
    # Migration: Ensure EVERY user has Checking & Savings accounts, and existing transactions are linked to Checking
    cursor.execute("SELECT id FROM users")
    all_users = cursor.fetchall()
    for user_row in all_users:
        uid = user_row["id"]
        cursor.execute("SELECT * FROM bank_accounts WHERE user_id = ?", (uid,))
        user_accs = cursor.fetchall()
        if not user_accs:
            cursor.execute(
                "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
                (uid, "Checking Account (Primary)", "Checking", 0.00)
            )
            check_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
                (uid, "Savings Vault Ledger", "Savings", 0.00)
            )
            cursor.execute(
                "UPDATE transactions SET account_id = ? WHERE user_id = ? AND account_id IS NULL",
                (check_id, uid)
            )
            
    conn.commit()
    conn.close()

# Token Helpers
def generate_token(user_id):
    user_id_str = str(user_id)
    sig = hmac.new(SECRET_KEY, user_id_str.encode(), hashlib.sha256).hexdigest()
    return f"{user_id_str}.{sig}"

def verify_token(token):
    if not token:
        return None
    try:
        user_id_str, sig = token.split('.', 1)
        expected_sig = hmac.new(SECRET_KEY, user_id_str.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected_sig):
            return int(user_id_str)
    except Exception:
        pass
    return None

def get_authenticated_user_id():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ', 1)[1]
    return verify_token(token)

# --- Static Routing ---
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    # Prevent infinite recursion if looking for index.html
    if path == "index.html":
        return send_from_directory('.', 'index.html')
    return send_from_directory('.', path)

# --- Authentication APIs ---
@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    
    if not name or not email or not password:
        return jsonify({"error": "All fields are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        cursor.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
            (name, email, password_hash)
        )
        user_id = cursor.lastrowid
        
        # Seed default checking and savings accounts for the new user
        cursor.execute(
            "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
            (user_id, "Checking Account (Primary)", "Checking", 0.00)
        )
        cursor.execute(
            "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
            (user_id, "Savings Vault Ledger", "Savings", 0.00)
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Email address already registered"}), 400
        
    token = generate_token(user_id)
    conn.close()
    
    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
            "phone_number": "",
            "avatar": "",
            "address": ""
        }
    }), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({"error": "Invalid email or password"}), 401
        
    token = generate_token(user['id'])
    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "phone_number": user['phone_number'] if user['phone_number'] else "",
            "avatar": user['avatar'] if user['avatar'] else "",
            "address": user['address'] if user['address'] else ""
        }
    })

@app.route('/api/auth/profile', methods=['GET'])
def get_profile():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, email, phone_number, avatar, address, budget_limit FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "success": True,
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "phone_number": user['phone_number'] if user['phone_number'] else "",
            "avatar": user['avatar'] if user['avatar'] else "",
            "address": user['address'] if user['address'] else "",
            "budget_limit": user['budget_limit'] if user['budget_limit'] is not None else 2000.00
        }
    })

@app.route('/api/auth/profile', methods=['PUT'])
def update_profile():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
    
    data = request.get_json() or {}
    name = data.get('name')
    email = data.get('email')
    phone_number = data.get('phone_number')
    avatar = data.get('avatar')
    address = data.get('address')
    password = data.get('password')
    budget_limit = data.get('budget_limit')
    
    if not name or not email:
        return jsonify({"error": "Name and email are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if budget_limit is not None:
        try:
            budget_limit = float(budget_limit)
        except ValueError:
            budget_limit = 2000.00
    else:
        cursor.execute("SELECT budget_limit FROM users WHERE id = ?", (user_id,))
        row_temp = cursor.fetchone()
        budget_limit = row_temp['budget_limit'] if (row_temp and row_temp['budget_limit'] is not None) else 2000.00

    # Check if email is already taken by another user
    cursor.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user_id))
    if cursor.fetchone():
        conn.close()
        return jsonify({"error": "Email is already in use by another account"}), 400
        
    if password:
        pass_hash = generate_password_hash(password, method="pbkdf2:sha256")
        cursor.execute(
            "UPDATE users SET name = ?, email = ?, phone_number = ?, avatar = ?, address = ?, password_hash = ?, budget_limit = ? WHERE id = ?",
            (name, email, phone_number, avatar, address, pass_hash, budget_limit, user_id)
        )
    else:
        cursor.execute(
            "UPDATE users SET name = ?, email = ?, phone_number = ?, avatar = ?, address = ?, budget_limit = ? WHERE id = ?",
            (name, email, phone_number, avatar, address, budget_limit, user_id)
        )
        
    conn.commit()
    conn.close()
    
    return jsonify({
        "success": True,
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
            "phone_number": phone_number if phone_number else "",
            "avatar": avatar if avatar else "",
            "address": address if address else "",
            "budget_limit": budget_limit
        }
    })

@app.route('/api/auth/profile', methods=['DELETE'])
def delete_profile():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM transactions WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM bank_accounts WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM goals WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "message": "Account deleted successfully"})

# --- Transaction APIs ---
@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    # Join with bank_accounts to fetch the linked account's name
    cursor.execute('''
        SELECT t.*, b.name as account_name 
        FROM transactions t 
        LEFT JOIN bank_accounts b ON t.account_id = b.id 
        WHERE t.user_id = ? 
        ORDER BY t.id DESC
    ''', (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    transactions = []
    for row in rows:
        transactions.append({
            "id": row["id"],
            "date": row["date"],
            "desc": row["desc"],
            "category": row["category"],
            "type": row["type"],
            "amount": row["amount"],
            "method": row["method"] if "method" in row.keys() else "Bank",
            "account_id": row["account_id"],
            "account_name": row["account_name"] or "None"
        })
        
    return jsonify(transactions)

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    data = request.get_json() or {}
    desc = data.get('desc')
    amount = data.get('amount')
    tx_type = data.get('type')
    category = data.get('category')
    date = data.get('date')
    method = data.get('method', 'Bank')
    account_id = data.get('account_id')
    
    if not desc or amount is None or not tx_type or not category:
        return jsonify({"error": "Description, amount, type, and category are required"}), 400
        
    if not date:
        date = datetime.now().strftime("%b %d, %Y, %I:%M %p")
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # If account_id is not specified, assign the user's first available account
    if not account_id:
        cursor.execute("SELECT id FROM bank_accounts WHERE user_id = ? LIMIT 1", (user_id,))
        first_acc = cursor.fetchone()
        if first_acc:
            account_id = first_acc["id"]
            
    if not account_id:
        conn.close()
        return jsonify({"error": "No bank account found for user. Please create a bank account first."}), 400
        
    # Insert transaction
    cursor.execute(
        "INSERT INTO transactions (user_id, date, desc, category, type, amount, method, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, date, desc, category, tx_type, float(amount), method, account_id)
    )
    new_id = cursor.lastrowid
    
    # Adjust corresponding account balance
    if tx_type == 'income':
        cursor.execute("UPDATE bank_accounts SET balance = balance + ? WHERE id = ?", (float(amount), account_id))
    else:
        cursor.execute("UPDATE bank_accounts SET balance = balance - ? WHERE id = ?", (float(amount), account_id))
        
    conn.commit()
    conn.close()
    
    return jsonify({
        "id": new_id,
        "date": date,
        "desc": desc,
        "category": category,
        "type": tx_type,
        "amount": float(amount),
        "method": method,
        "account_id": account_id
    }), 201

@app.route('/api/transactions/<int:tx_id>', methods=['DELETE'])
def delete_transaction(tx_id):
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify transaction owner
    cursor.execute("SELECT * FROM transactions WHERE id = ? AND user_id = ?", (tx_id, user_id))
    tx = cursor.fetchone()
    
    if not tx:
        conn.close()
        return jsonify({"error": "Transaction not found or unauthorized"}), 404
        
    # Revert account balance adjustment
    tx_type = tx["type"]
    amount = float(tx["amount"])
    account_id = tx["account_id"]
    
    if account_id:
        if tx_type == 'income':
            cursor.execute("UPDATE bank_accounts SET balance = balance - ? WHERE id = ?", (amount, account_id))
        else:
            cursor.execute("UPDATE bank_accounts SET balance = balance + ? WHERE id = ?", (amount, account_id))
            
    cursor.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

# --- Bank Accounts APIs ---
@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bank_accounts WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    accounts = []
    for r in rows:
        accounts.append({
            "id": r["id"],
            "name": r["name"],
            "type": r["type"],
            "balance": r["balance"]
        })
    return jsonify(accounts)

@app.route('/api/accounts', methods=['POST'])
def add_account():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    data = request.get_json() or {}
    name = data.get('name')
    acc_type = data.get('type', 'Checking')
    balance = data.get('balance', 0.0)
    
    if not name:
        return jsonify({"error": "Account name is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO bank_accounts (user_id, name, type, balance) VALUES (?, ?, ?, ?)",
        (user_id, name, acc_type, float(balance))
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return jsonify({
        "id": new_id,
        "name": name,
        "type": acc_type,
        "balance": float(balance)
    }), 201

@app.route('/api/accounts/<int:acc_id>', methods=['DELETE'])
def delete_account(acc_id):
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", (acc_id, user_id))
    acc = cursor.fetchone()
    if not acc:
        conn.close()
        return jsonify({"error": "Account not found"}), 404
        
    cursor.execute("DELETE FROM bank_accounts WHERE id = ?", (acc_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/accounts/transfer', methods=['POST'])
def transfer_funds():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    data = request.get_json() or {}
    from_id = data.get('from_account_id')
    to_id = data.get('to_account_id')
    amount = float(data.get('amount', 0.0))
    
    if from_id == to_id:
        return jsonify({"error": "Source and destination accounts must be different"}), 400
    if amount <= 0:
        return jsonify({"error": "Transfer amount must be positive"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify accounts belong to user
    cursor.execute("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", (from_id, user_id))
    from_acc = cursor.fetchone()
    cursor.execute("SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?", (to_id, user_id))
    to_acc = cursor.fetchone()
    
    if not from_acc or not to_acc:
        conn.close()
        return jsonify({"error": "One or both accounts not found"}), 404
        
    if from_acc['balance'] < amount:
        conn.close()
        return jsonify({"error": "Insufficient funds in source account"}), 400
        
    # Deduct from source, add to dest
    cursor.execute("UPDATE bank_accounts SET balance = balance - ? WHERE id = ?", (amount, from_id))
    cursor.execute("UPDATE bank_accounts SET balance = balance + ? WHERE id = ?", (amount, to_id))
    
    # Insert matching transactions
    date_str = datetime.now().strftime("%b %d, %Y, %I:%M %p")
    cursor.execute(
        "INSERT INTO transactions (user_id, date, desc, category, type, amount, method, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, date_str, f"Transfer Out to {to_acc['name']}", "Transfer", "expense", amount, "Bank", from_id)
    )
    cursor.execute(
        "INSERT INTO transactions (user_id, date, desc, category, type, amount, method, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_id, date_str, f"Transfer In from {from_acc['name']}", "Transfer", "income", amount, "Bank", to_id)
    )
    
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# --- Goals APIs ---
@app.route('/api/goals', methods=['GET'])
def get_goals():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    goals = []
    for row in rows:
        goals.append({
            "id": row["id"],
            "name": row["name"],
            "target_amount": row["target_amount"],
            "current_amount": row["current_amount"],
            "target_date": row["target_date"]
        })
    return jsonify(goals)

@app.route('/api/goals', methods=['POST'])
def add_goal():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    data = request.get_json() or {}
    name = data.get('name')
    target_amount = data.get('target_amount')
    current_amount = data.get('current_amount', 0.0)
    target_date = data.get('target_date')
    
    if not name or target_amount is None:
        return jsonify({"error": "Goal name and target amount are required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO goals (user_id, name, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, float(target_amount), float(current_amount), target_date)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    
    return jsonify({
        "success": True,
        "id": new_id,
        "name": name,
        "target_amount": target_amount,
        "current_amount": current_amount,
        "target_date": target_date
    }), 201

@app.route('/api/goals/<int:goal_id>', methods=['PUT'])
def update_goal(goal_id):
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    data = request.get_json() or {}
    current_amount = data.get('current_amount')
    
    if current_amount is None:
        return jsonify({"error": "Current amount is required"}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    goal = cursor.fetchone()
    if not goal:
        conn.close()
        return jsonify({"error": "Goal not found"}), 404
        
    cursor.execute(
        "UPDATE goals SET current_amount = ? WHERE id = ? AND user_id = ?",
        (float(current_amount), goal_id, user_id)
    )
    conn.commit()
    conn.close()
    
    return jsonify({"success": True, "current_amount": current_amount})

@app.route('/api/goals/<int:goal_id>', methods=['DELETE'])
def delete_goal(goal_id):
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    goal = cursor.fetchone()
    if not goal:
        conn.close()
        return jsonify({"error": "Goal not found"}), 404
        
    cursor.execute("DELETE FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    conn.commit()
    conn.close()
    
    return jsonify({"success": True})

# --- AI suggestions endpoint ---
@app.route('/api/ai/suggestions', methods=['GET'])
def get_ai_suggestions():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM transactions WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    total_income = 0.0
    total_expenses = 0.0
    category_expenses = {}
    
    for row in rows:
        amount = float(row["amount"])
        if row["type"] == "income":
            total_income += amount
        else:
            total_expenses += amount
            cat = row["category"]
            category_expenses[cat] = category_expenses.get(cat, 0.0) + amount
            
    net_savings = total_income - total_expenses
    savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0.0
    burn_rate = (total_expenses / total_income * 100) if total_income > 0 else (100.0 if total_expenses > 0 else 0.0)
    
    suggestions = []
    
    # 1. Check for Overall Deficit / Loss Management (Highest Priority)
    if total_expenses > total_income:
        deficit = total_expenses - total_income
        suggestions.append({
            "id": "loss_mitigation",
            "title": "Loss Mitigation Alert: Stop the Burn",
            "desc": f"Your expenses exceed your income by ${deficit:.2f} this period! You are operating in a net deficit. We suggest immediately auditing subscription services, deferring large discretionary purchases, and creating a cash reserve.",
            "priority": "high",
            "category": "Loss Management",
            "icon": "fa-triangle-exclamation",
            "action": "Disable auto-renewals on non-essential subscriptions and review dining logs."
        })
    elif total_income > 0 and savings_rate < 15.0:
        suggestions.append({
            "id": "savings_boost",
            "title": "Boost Your Savings Reserve",
            "desc": f"Your current savings rate is {savings_rate:.1f}%, which is lower than the recommended 20% baseline. Aim to optimize your utility bills or negotiate recurring insurance plans to increase margins.",
            "priority": "medium",
            "category": "Savings Optimization",
            "icon": "fa-percent",
            "action": "Set a direct auto-transfer of 10% of income to your Savings Vault ledger on paydays."
        })
    elif total_income > 0:
        suggestions.append({
            "id": "wealth_growth",
            "title": "Healthy Financial Standing",
            "desc": f"Congratulations! You saved {savings_rate:.1f}% of your earnings (${net_savings:.2f}). Operating with a surplus reduces financial anxiety. We advise funneling these savings into long-term investments or emergency assets.",
            "priority": "low",
            "category": "Wealth Building",
            "icon": "fa-circle-check",
            "action": "Allocate 30% of this month's savings to your Savings Vault Vault."
        })
        
    # 2. Check for Specific High Category Spending
    if total_expenses > 0:
        top_cat = None
        top_amt = -1.0
        for cat, amt in category_expenses.items():
            if amt > top_amt:
                top_amt = amt
                top_cat = cat
                
        if top_cat:
            cat_pct = (top_amt / total_expenses) * 100
            if cat_pct > 30.0:
                suggestions.append({
                    "id": "category_overspend",
                    "title": f"High Spending in {top_cat}",
                    "desc": f"{top_cat} makes up {cat_pct:.1f}% (${top_amt:.2f}) of your total monthly expenses. This concentration indicates a major opportunity for budget compression.",
                    "priority": "high" if cat_pct > 50.0 else "medium",
                    "category": "Category Cap",
                    "icon": "fa-chart-pie",
                    "action": f"Set a strict budget threshold for {top_cat} of 25% of your total expenses next month."
                })
                
    # 3. Method-based suggestions to incentivize Digital Scan to Pay or Bank
    methods_used = [row["method"] for row in rows if row["type"] == "expense"]
    cash_count = sum(1 for m in methods_used if m == "Cash")
    if cash_count > 2:
        suggestions.append({
            "id": "incentivize_digital",
            "title": "Minimize Cash Leakages",
            "desc": "You have recorded several physical Cash transactions. Cash expenses are harder to audit. Switching to digital 'Bank Transfer' or 'Scan to Pay' provides automatic logging and instant cashbacks.",
            "priority": "low",
            "category": "Digital Efficiency",
            "icon": "fa-wallet",
            "action": "Use the new integrated Scan to Pay simulator for your daily retail purchases."
        })

    # Default general advice if suggestions list is short
    if len(suggestions) < 3:
        suggestions.append({
            "id": "default_emergency",
            "title": "Emergency Fund Rule of Thumb",
            "desc": "Ensure you maintain liquid assets equivalent to 3-6 months of essential living expenses. Keep this ledger separate from checking reserves.",
            "priority": "low",
            "category": "Reserve planning",
            "icon": "fa-shield-halved",
            "action": "Ensure checking balance does not drop below your average monthly expenses."
        })

    return jsonify({
        "summary": {
            "income": total_income,
            "expenses": total_expenses,
            "balance": net_savings,
            "savings_rate": savings_rate,
            "burn_rate": burn_rate
        },
        "suggestions": suggestions
    })

@app.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    user_id = get_authenticated_user_id()
    if user_id is None:
        return jsonify({"error": "Unauthorized access"}), 401
        
    data = request.get_json() or {}
    message = data.get('message', '').strip().lower()
    
    if not message:
        return jsonify({"reply": "I couldn't hear you. Please type a message!"})
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT type, amount, category FROM transactions WHERE user_id = ?", (user_id,))
    tx_rows = cursor.fetchall()
    
    cursor.execute("SELECT name, type, balance FROM bank_accounts WHERE user_id = ?", (user_id,))
    acc_rows = cursor.fetchall()
    
    cursor.execute("SELECT name, target_amount, current_amount FROM goals WHERE user_id = ?", (user_id,))
    goal_rows = cursor.fetchall()
    
    cursor.execute("SELECT budget_limit FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    budget_limit = user_row['budget_limit'] if (user_row and user_row['budget_limit'] is not None) else 2000.00
    
    conn.close()
    
    total_income = sum(r['amount'] for r in tx_rows if r['type'] == 'income')
    total_expenses = sum(r['amount'] for r in tx_rows if r['type'] == 'expense')
    net_savings = total_income - total_expenses
    savings_rate = (net_savings / total_income * 100) if total_income > 0 else 0
    
    total_balance = sum(r['balance'] for r in acc_rows)
    checking_balance = sum(r['balance'] for r in acc_rows if r['type'] == 'Checking')
    savings_balance = sum(r['balance'] for r in acc_rows if r['type'] == 'Savings')
    
    total_goal_target = sum(r['target_amount'] for r in goal_rows)
    total_goal_saved = sum(r['current_amount'] for r in goal_rows)
    goal_progress = (total_goal_saved / total_goal_target * 100) if total_goal_target > 0 else 0
    
    if 'savings' in message or 'rate' in message or 'save' in message:
        if total_income == 0:
            reply = "You don't have any income registered yet! Add your Salary or Freelance records to let me calculate your savings rate."
        else:
            reply = f"Your Net Income is ${total_income:,.2f} against Total Expenses of ${total_expenses:,.2f}. This gives you a **Net Savings Rate of {savings_rate:.1f}%** (Total Saved: ${net_savings:,.2f}). Keeping your savings rate above 20% is recommended for healthy milestone progression."
            
    elif 'budget' in message or 'limit' in message or 'remaining' in message:
        limit = budget_limit
        remaining = limit - total_expenses
        pct = (total_expenses / limit * 100) if limit > 0 else 0
        if remaining <= 0:
            reply = f"🚨 **Alert:** You have exceeded your monthly budget limit of ${limit:,.2f}! Total spent is ${total_expenses:,.2f}. Please restrict discretionary spending."
        else:
            reply = f"You have spent **${total_expenses:,.2f}** out of your monthly limit of **${limit:,.2f}** ({pct:.1f}% used). You have **${remaining:,.2f} remaining** to spend safely this month."
            
    elif 'balance' in message or 'account' in message or 'wallet' in message:
        acc_details = ", ".join([f"{r['name']} ({r['type']}: ${r['balance']:,.2f})" for r in acc_rows])
        reply = f"Your total wallet balance is **${total_balance:,.2f}**.\n\n**Breakdown:**\n- Checking: ${checking_balance:,.2f}\n- Savings: ${savings_balance:,.2f}\n\n**Linked Nodes:** {acc_details if acc_details else 'No accounts linked.'}"
        
    elif 'goals' in message or 'milestone' in message or 'target' in message:
        if not goal_rows:
            reply = "You do not have any savings goals active! Navigate to the **Goals** tab to set a milestone target for tech purchases, emergencies, or travels."
        else:
            goal_details = "\n".join([f"- **{r['name']}**: ${r['current_amount']:,.2f} of ${r['target_amount']:,.2f} saved" for r in goal_rows])
            reply = f"You have **{len(goal_rows)} active savings goals**.\n\nYour overall targets total **${total_goal_target:,.2f}**, of which you have saved **${total_goal_saved:,.2f}** ({goal_progress:.1f}% complete).\n\n**Milestones:**\n{goal_details}"
            
    elif 'help' in message or 'hello' in message or 'hi' in message or 'hey' in message:
        reply = "Hello! I am your MyFin Chatbot assistant. You can ask me:\n1. *'What is my savings rate?'*\n2. *'What is my remaining budget?'*\n3. *'Show my account balances'* \n4. *'What are my active goals?'*"
        
    elif 'tip' in message or 'suggest' in message or 'advice' in message:
        if total_expenses > 1500:
            reply = "💡 **Tip:** Your budget burn rate is currently high. We suggest deferring non-essential Shopping or Entertainment logs to next month."
        else:
            reply = "💡 **Tip:** Your spending speed is healthy! Consider setting up a target goal to direct 15% of your checking balance automatically to your savings vault."
            
    else:
        category_sums = {}
        for r in tx_rows:
            if r['type'] == 'expense':
                category_sums[r['category']] = category_sums.get(r['category'], 0) + r['amount']
        if category_sums:
            top_cat = max(category_sums, key=category_sums.get)
            top_val = category_sums[top_cat]
            reply = f"I parsed your ledgers! Your top expense category is **{top_cat}** with total spending of **${top_val:,.2f}**. Ask me about savings, budget limits, or wallet balances for more specific answers!"
        else:
            reply = "I'm not sure how to answer that question. Try asking about your **savings rate**, **remaining budget**, **account balances**, or active **milestone goals**!"
            
    return jsonify({"reply": reply})

if __name__ == '__main__':
    init_db()
    # Serve on port 5001
    app.run(host='0.0.0.0', port=5001, debug=True)
