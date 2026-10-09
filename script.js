const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5001'
    ? 'http://localhost:5001/api'
    : (window.location.origin.includes('http') ? `${window.location.origin}/api` : 'http://localhost:5001/api');

// --- LOCAL STORAGE API MOCK FALLBACK FOR STATIC DEPLOYMENTS ---
let USE_LOCAL_STORAGE = false;

const originalFetch = window.fetch;

function getLocalTable(name) {
    const data = localStorage.getItem(`myfin_${name}`);
    if (!data) {
        if (name === 'users') {
            const defaultUser = [{ id: 1, name: "Admin User", email: "admin@example.com", password: "password123", phone_number: "", avatar: "", address: "", budget_limit: 2000.00 }];
            localStorage.setItem(`myfin_users`, JSON.stringify(defaultUser));
            return defaultUser;
        }
        if (name === 'bank_accounts') {
            const defaultAccounts = [
                { id: 101, user_id: 1, name: "Checking Account (Primary)", type: "Checking", balance: 1250.00 },
                { id: 102, user_id: 1, name: "Savings Vault Ledger", type: "Savings", balance: 5000.00 }
            ];
            localStorage.setItem(`myfin_bank_accounts`, JSON.stringify(defaultAccounts));
            return defaultAccounts;
        }
        return [];
    }
    return JSON.parse(data);
}

function setLocalTable(name, data) {
    localStorage.setItem(`myfin_${name}`, JSON.stringify(data));
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status: status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function getAuthUserId(options) {
    const authHeader = options?.headers?.['Authorization'] || options?.headers?.['authorization'];
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '');
    return parseInt(token) || null;
}

async function checkBackendAvailability() {
    try {
        const res = await originalFetch(`${API_BASE}/auth/profile`, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer test' }
        });
        if (res.status === 404 || (res.headers.get('content-type') && res.headers.get('content-type').includes('text/html'))) {
            USE_LOCAL_STORAGE = true;
        } else {
            USE_LOCAL_STORAGE = false;
        }
    } catch (e) {
        USE_LOCAL_STORAGE = true;
    }
    console.log("MyFin API mode:", USE_LOCAL_STORAGE ? "LocalStorage Mock Mode" : "Live Flask API Mode");
}

async function mockFetch(url, options) {
    const method = options?.method || 'GET';
    const path = url.replace(API_BASE, '');
    
    // Auth Signup
    if (path === '/auth/signup' && method === 'POST') {
        const { name, email, password } = JSON.parse(options.body);
        if (!name || !email || !password) {
            return jsonResponse({ error: "All fields are required" }, 400);
        }
        const users = getLocalTable('users');
        if (users.find(u => u.email === email)) {
            return jsonResponse({ error: "Email address already registered" }, 400);
        }
        const user_id = Date.now();
        const newUser = { id: user_id, name, email, password, phone_number: "", avatar: "", address: "", budget_limit: 2000.00 };
        users.push(newUser);
        setLocalTable('users', users);
        
        const accounts = getLocalTable('bank_accounts');
        accounts.push({ id: Date.now() + 1, user_id, name: "Checking Account (Primary)", type: "Checking", balance: 0.00 });
        accounts.push({ id: Date.now() + 2, user_id, name: "Savings Vault Ledger", type: "Savings", balance: 0.00 });
        setLocalTable('bank_accounts', accounts);

        return jsonResponse({
            success: true,
            token: String(user_id),
            user: { id: user_id, name, email, phone_number: "", avatar: "", address: "" }
        }, 201);
    }
    
    // Auth Login
    if (path === '/auth/login' && method === 'POST') {
        const { email, password } = JSON.parse(options.body);
        const users = getLocalTable('users');
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) {
            return jsonResponse({ error: "Invalid email or password" }, 401);
        }
        return jsonResponse({
            success: true,
            token: String(user.id),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone_number: user.phone_number || "",
                avatar: user.avatar || "",
                address: user.address || ""
            }
        });
    }
    
    // Auth Profile (GET)
    if (path === '/auth/profile' && method === 'GET') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const users = getLocalTable('users');
        const user = users.find(u => u.id === user_id);
        if (!user) return jsonResponse({ error: "User not found" }, 404);
        return jsonResponse({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone_number: user.phone_number || "",
                avatar: user.avatar || "",
                address: user.address || "",
                budget_limit: user.budget_limit !== undefined ? user.budget_limit : 2000.00
            }
        });
    }
    
    // Auth Profile (PUT)
    if (path === '/auth/profile' && method === 'PUT') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const data = JSON.parse(options.body);
        const users = getLocalTable('users');
        const userIndex = users.findIndex(u => u.id === user_id);
        if (userIndex === -1) return jsonResponse({ error: "User not found" }, 404);
        
        const user = users[userIndex];
        if (data.name) user.name = data.name;
        if (data.phone_number) user.phone_number = data.phone_number;
        if (data.address) user.address = data.address;
        if (data.avatar) user.avatar = data.avatar;
        if (data.budget_limit !== undefined) user.budget_limit = parseFloat(data.budget_limit);
        
        users[userIndex] = user;
        setLocalTable('users', users);
        return jsonResponse({ success: true, user });
    }
    
    // Auth Profile (DELETE)
    if (path === '/auth/profile' && method === 'DELETE') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        
        let users = getLocalTable('users');
        users = users.filter(u => u.id !== user_id);
        setLocalTable('users', users);
        
        let txs = getLocalTable('transactions');
        txs = txs.filter(t => t.user_id !== user_id);
        setLocalTable('transactions', txs);
        
        let accs = getLocalTable('bank_accounts');
        accs = accs.filter(a => a.user_id !== user_id);
        setLocalTable('bank_accounts', accs);
        
        let goals = getLocalTable('goals');
        goals = goals.filter(g => g.user_id !== user_id);
        setLocalTable('goals', goals);
        
        return jsonResponse({ success: true });
    }
    
    // Transactions (GET)
    if (path === '/transactions' && method === 'GET') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const txs = getLocalTable('transactions');
        const userTxs = txs.filter(t => t.user_id === user_id);
        return jsonResponse(userTxs);
    }
    
    // Transactions (POST)
    if (path === '/transactions' && method === 'POST') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const data = JSON.parse(options.body);
        const { amount, type, category, desc, method: txMethod, account_id } = data;
        
        const amtVal = parseFloat(amount);
        const txs = getLocalTable('transactions');
        const newTx = {
            id: Date.now(),
            user_id,
            amount: amtVal,
            type,
            category,
            desc,
            date: new Date().toISOString().replace('T', ' ').substring(0, 19),
            method: txMethod,
            account_id: parseInt(account_id) || null
        };
        txs.push(newTx);
        setLocalTable('transactions', txs);
        
        if (account_id) {
            const accs = getLocalTable('bank_accounts');
            const accIndex = accs.findIndex(a => a.id === parseInt(account_id) && a.user_id === user_id);
            if (accIndex !== -1) {
                if (type === 'income') {
                    accs[accIndex].balance = parseFloat(accs[accIndex].balance) + amtVal;
                } else {
                    accs[accIndex].balance = parseFloat(accs[accIndex].balance) - amtVal;
                }
                setLocalTable('bank_accounts', accs);
            }
        }
        return jsonResponse(newTx, 201);
    }
    
    // Transactions (DELETE)
    if (path.startsWith('/transactions/') && method === 'DELETE') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const tx_id = parseInt(path.replace('/transactions/', ''));
        let txs = getLocalTable('transactions');
        const tx = txs.find(t => t.id === tx_id && t.user_id === user_id);
        if (!tx) return jsonResponse({ error: "Transaction not found" }, 404);
        
        if (tx.account_id) {
            const accs = getLocalTable('bank_accounts');
            const accIndex = accs.findIndex(a => a.id === tx.account_id && a.user_id === user_id);
            if (accIndex !== -1) {
                if (tx.type === 'income') {
                    accs[accIndex].balance = parseFloat(accs[accIndex].balance) - parseFloat(tx.amount);
                } else {
                    accs[accIndex].balance = parseFloat(accs[accIndex].balance) + parseFloat(tx.amount);
                }
                setLocalTable('bank_accounts', accs);
            }
        }
        
        txs = txs.filter(t => t.id !== tx_id);
        setLocalTable('transactions', txs);
        return jsonResponse({ success: true });
    }
    
    // Accounts (GET)
    if (path === '/accounts' && method === 'GET') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const accs = getLocalTable('bank_accounts');
        const userAccs = accs.filter(a => a.user_id === user_id);
        return jsonResponse(userAccs);
    }
    
    // Accounts (POST)
    if (path === '/accounts' && method === 'POST') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const { name, type, balance } = JSON.parse(options.body);
        const accs = getLocalTable('bank_accounts');
        const newAcc = {
            id: Date.now(),
            user_id,
            name,
            type,
            balance: parseFloat(balance) || 0.00
        };
        accs.push(newAcc);
        setLocalTable('bank_accounts', accs);
        return jsonResponse(newAcc, 201);
    }
    
    // Accounts (DELETE)
    if (path.startsWith('/accounts/') && method === 'DELETE') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const acc_id = parseInt(path.replace('/accounts/', ''));
        let accs = getLocalTable('bank_accounts');
        const acc = accs.find(a => a.id === acc_id && a.user_id === user_id);
        if (!acc) return jsonResponse({ error: "Account not found" }, 404);
        accs = accs.filter(a => a.id !== acc_id);
        setLocalTable('bank_accounts', accs);
        return jsonResponse({ success: true });
    }
    
    // Accounts Transfer
    if (path === '/accounts/transfer' && method === 'POST') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const { source_account_id, target_account_id, amount } = JSON.parse(options.body);
        const amtVal = parseFloat(amount);
        if (amtVal <= 0) return jsonResponse({ error: "Transfer amount must be positive" }, 400);
        
        const accs = getLocalTable('bank_accounts');
        const srcIndex = accs.findIndex(a => a.id === parseInt(source_account_id) && a.user_id === user_id);
        const dstIndex = accs.findIndex(a => a.id === parseInt(target_account_id) && a.user_id === user_id);
        
        if (srcIndex === -1 || dstIndex === -1) {
            return jsonResponse({ error: "Invalid accounts" }, 400);
        }
        if (accs[srcIndex].balance < amtVal) {
            return jsonResponse({ error: "Insufficient balance" }, 400);
        }
        
        accs[srcIndex].balance = parseFloat(accs[srcIndex].balance) - amtVal;
        accs[dstIndex].balance = parseFloat(accs[dstIndex].balance) + amtVal;
        setLocalTable('bank_accounts', accs);
        
        const txs = getLocalTable('transactions');
        const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
        txs.push({
            id: Date.now(),
            user_id,
            amount: amtVal,
            type: "expense",
            category: "Transfer",
            desc: `Transfer Out to ${accs[dstIndex].name}`,
            date: dateStr,
            method: "Bank Transfer",
            account_id: accs[srcIndex].id
        });
        txs.push({
            id: Date.now() + 1,
            user_id,
            amount: amtVal,
            type: "income",
            category: "Transfer",
            desc: `Transfer In from ${accs[srcIndex].name}`,
            date: dateStr,
            method: "Bank Transfer",
            account_id: accs[dstIndex].id
        });
        setLocalTable('transactions', txs);
        
        return jsonResponse({ success: true });
    }
    
    // Goals (GET)
    if (path === '/goals' && method === 'GET') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const goals = getLocalTable('goals');
        const userGoals = goals.filter(g => g.user_id === user_id);
        return jsonResponse(userGoals);
    }
    
    // Goals (POST)
    if (path === '/goals' && method === 'POST') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const { name, target_amount, current_amount } = JSON.parse(options.body);
        const goals = getLocalTable('goals');
        const newGoal = {
            id: Date.now(),
            user_id,
            name,
            target_amount: parseFloat(target_amount),
            current_amount: parseFloat(current_amount) || 0.00
        };
        goals.push(newGoal);
        setLocalTable('goals', goals);
        return jsonResponse(newGoal, 201);
    }
    
    // Goals (PUT)
    if (path.startsWith('/goals/') && method === 'PUT') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const goal_id = parseInt(path.replace('/goals/', ''));
        const { current_amount } = JSON.parse(options.body);
        const goals = getLocalTable('goals');
        const goalIndex = goals.findIndex(g => g.id === goal_id && g.user_id === user_id);
        if (goalIndex === -1) return jsonResponse({ error: "Goal not found" }, 404);
        goals[goalIndex].current_amount = parseFloat(current_amount);
        setLocalTable('goals', goals);
        return jsonResponse(goals[goalIndex]);
    }
    
    // Goals (DELETE)
    if (path.startsWith('/goals/') && method === 'DELETE') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        const goal_id = parseInt(path.replace('/goals/', ''));
        let goals = getLocalTable('goals');
        const goal = goals.find(g => g.id === goal_id && g.user_id === user_id);
        if (!goal) return jsonResponse({ error: "Goal not found" }, 404);
        goals = goals.filter(g => g.id !== goal_id);
        setLocalTable('goals', goals);
        return jsonResponse({ success: true });
    }
    
    // AI suggestions (GET)
    if (path === '/ai/suggestions' && method === 'GET') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        
        const txs = getLocalTable('transactions').filter(t => t.user_id === user_id);
        
        let total_income = 0.0;
        let total_expenses = 0.0;
        const category_expenses = {};
        
        txs.forEach(t => {
            const amt = parseFloat(t.amount);
            if (t.type === 'income') {
                total_income += amt;
            } else {
                total_expenses += amt;
                category_expenses[t.category] = (category_expenses[t.category] || 0) + amt;
            }
        });
        
        const net_savings = total_income - total_expenses;
        const savings_rate = total_income > 0 ? (net_savings / total_income * 100) : 0.0;
        const burn_rate = total_income > 0 ? (total_expenses / total_income * 100) : (total_expenses > 0 ? 100.0 : 0.0);
        
        const suggestions = [];
        
        if (total_expenses > total_income) {
            const deficit = total_expenses - total_income;
            suggestions.push({
                id: "loss_mitigation",
                title: "Loss Mitigation Alert: Stop the Burn",
                desc: `Your expenses exceed your income by $${deficit.toFixed(2)} this period! You are operating in a net deficit. We suggest immediately auditing subscription services, deferring large discretionary purchases, and creating a cash reserve.`,
                priority: "high",
                category: "Loss Management",
                icon: "fa-triangle-exclamation",
                action: "Disable auto-renewals on non-essential subscriptions and review dining logs."
            });
        } else if (total_income > 0 && savings_rate < 15.0) {
            suggestions.push({
                id: "savings_boost",
                title: "Boost Your Savings Reserve",
                desc: `Your current savings rate is ${savings_rate.toFixed(1)}%, which is lower than the recommended 20% baseline. Aim to optimize your utility bills or negotiate recurring insurance plans to increase margins.`,
                priority: "medium",
                category: "Savings Optimization",
                icon: "fa-percent",
                action: "Set a direct auto-transfer of 10% of income to your Savings Vault ledger on paydays."
            });
        } else if (total_income > 0) {
            suggestions.push({
                id: "wealth_growth",
                title: "Healthy Financial Standing",
                desc: `Congratulations! You saved ${savings_rate.toFixed(1)}% of your earnings ($${net_savings.toFixed(2)}). Operating with a surplus reduces financial anxiety. We advise funneling these savings into long-term investments or emergency assets.`,
                priority: "low",
                category: "Wealth Building",
                icon: "fa-circle-check",
                action: "Allocate 30% of this month's savings to your Savings Vault Vault."
            });
        }
        
        if (total_expenses > 0) {
            let top_cat = null;
            let top_amt = -1.0;
            for (const cat in category_expenses) {
                if (category_expenses[cat] > top_amt) {
                    top_amt = category_expenses[cat];
                    top_cat = cat;
                }
            }
            if (top_cat) {
                const cat_pct = (top_amt / total_expenses) * 100;
                if (cat_pct > 30.0) {
                    suggestions.push({
                        id: "category_overspend",
                        title: `High Spending in ${top_cat}`,
                        desc: `${top_cat} makes up ${cat_pct.toFixed(1)}% ($${top_amt.toFixed(2)}) of your total monthly expenses. This concentration indicates a major opportunity for budget compression.`,
                        priority: cat_pct > 50.0 ? "high" : "medium",
                        category: "Category Cap",
                        icon: "fa-chart-pie",
                        action: `Set a strict budget threshold for ${top_cat} of 25% of your total expenses next month.`
                    });
                }
            }
        }
        
        const methods_used = txs.filter(t => t.type === 'expense').map(t => t.method);
        const cash_count = methods_used.filter(m => m === 'Cash').length;
        if (cash_count > 2) {
            suggestions.push({
                id: "incentivize_digital",
                title: "Minimize Cash Leakages",
                desc: "You have recorded several physical Cash transactions. Cash expenses are harder to audit. Switching to digital 'Bank Transfer' or 'Scan to Pay' provides automatic logging and instant cashbacks.",
                priority: "low",
                category: "Digital Efficiency",
                icon: "fa-wallet",
                action: "Use the new integrated Scan to Pay simulator for your daily retail purchases."
            });
        }
        
        if (suggestions.length < 3) {
            suggestions.push({
                id: "default_emergency",
                title: "Emergency Fund Rule of Thumb",
                desc: "Ensure you maintain liquid assets equivalent to 3-6 months of essential living expenses. Keep this ledger separate from checking reserves.",
                priority: "low",
                category: "Reserve planning",
                icon: "fa-shield-halved",
                action: "Ensure checking balance does not drop below your average monthly expenses."
            });
        }
        
        return jsonResponse({
            summary: {
                income: total_income,
                expenses: total_expenses,
                balance: net_savings,
                savings_rate: savings_rate,
                burn_rate: burn_rate
            },
            suggestions: suggestions
        });
    }
    
    // AI Chat (POST)
    if (path === '/ai/chat' && method === 'POST') {
        const user_id = getAuthUserId(options);
        if (!user_id) return jsonResponse({ error: "Unauthorized access" }, 401);
        
        const { message } = JSON.parse(options.body);
        const msg = (message || '').trim().toLowerCase();
        
        if (!msg) {
            return jsonResponse({ reply: "I couldn't hear you. Please type a message!" });
        }
        
        const txs = getLocalTable('transactions').filter(t => t.user_id === user_id);
        const accs = getLocalTable('bank_accounts').filter(a => a.user_id === user_id);
        const goals = getLocalTable('goals').filter(g => g.user_id === user_id);
        const users = getLocalTable('users');
        const user = users.find(u => u.id === user_id);
        const budget_limit = user?.budget_limit !== undefined ? user.budget_limit : 2000.00;
        
        const total_income = txs.filter(t => t.type === 'income').reduce((acc, t) => acc + parseFloat(t.amount), 0);
        const total_expenses = txs.filter(t => t.type === 'expense').reduce((acc, t) => acc + parseFloat(t.amount), 0);
        const net_savings = total_income - total_expenses;
        const savings_rate = total_income > 0 ? (net_savings / total_income * 100) : 0;
        
        const total_balance = accs.reduce((acc, a) => acc + parseFloat(a.balance), 0);
        const checking_balance = accs.filter(a => a.type === 'Checking').reduce((acc, a) => acc + parseFloat(a.balance), 0);
        const savings_balance = accs.filter(a => a.type === 'Savings').reduce((acc, a) => acc + parseFloat(a.balance), 0);
        
        const total_goal_target = goals.reduce((acc, g) => acc + parseFloat(g.target_amount), 0);
        const total_goal_saved = goals.reduce((acc, g) => acc + parseFloat(g.current_amount), 0);
        const goal_progress = total_goal_target > 0 ? (total_goal_saved / total_goal_target * 100) : 0;
        
        let reply = "";
        
        if (msg.includes('savings') || msg.includes('rate') || msg.includes('save')) {
            if (total_income === 0) {
                reply = "You don't have any income registered yet! Add your Salary or Freelance records to let me calculate your savings rate.";
            } else {
                reply = `Your Net Income is $${total_income.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} against Total Expenses of $${total_expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. This gives you a **Net Savings Rate of ${savings_rate.toFixed(1)}%** (Total Saved: $${net_savings.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}). Keeping your savings rate above 20% is recommended for healthy milestone progression.`;
            }
        } else if (msg.includes('budget') || msg.includes('limit') || msg.includes('remaining')) {
            const limit = budget_limit;
            const remaining = limit - total_expenses;
            const pct = limit > 0 ? (total_expenses / limit * 100) : 0;
            if (remaining <= 0) {
                reply = `🚨 **Alert:** You have exceeded your monthly budget limit of $${limit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}! Total spent is $${total_expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}. Please restrict discretionary spending.`;
            } else {
                reply = `You have spent **$${total_expenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}** out of your monthly limit of **$${limit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}** (${pct.toFixed(1)}% used). You have **$${remaining.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} remaining** to spend safely this month.`;
            }
        } else if (msg.includes('balance') || msg.includes('account') || msg.includes('wallet')) {
            const acc_details = accs.map(a => `${a.name} (${a.type}: $${parseFloat(a.balance).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})})`).join(', ');
            reply = `Your total wallet balance is **$${total_balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**.\n\n**Breakdown:**\n- Checking: $${checking_balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n- Savings: $${savings_balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n\n**Linked Nodes:** ${acc_details ? acc_details : 'No accounts linked.'}`;
        } else if (msg.includes('goals') || msg.includes('milestone') || msg.includes('target')) {
            if (goals.length === 0) {
                reply = "You do not have any savings goals active! Navigate to the **Goals** tab to set a milestone target for tech purchases, emergencies, or travels.";
            } else {
                const goal_details = goals.map(g => `- **${g.name}**: $${parseFloat(g.current_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} of $${parseFloat(g.target_amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} saved`).join('\n');
                reply = `You have **${goals.length} active savings goals**.\n\nYour overall targets total **$${total_goal_target.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**, of which you have saved **$${total_goal_saved.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}** (${goal_progress.toFixed(1)}% complete).\n\n**Milestones:**\n${goal_details}`;
            }
        } else if (msg.includes('help') || msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
            reply = "Hello! I am your MyFin Chatbot assistant. You can ask me:\n1. *'What is my savings rate?'*\n2. *'What is my remaining budget?'*\n3. *'Show my account balances'* \n4. *'What are my active goals?'*";
        } else if (msg.includes('tip') || msg.includes('suggest') || msg.includes('advice')) {
            if (total_expenses > 1500) {
                reply = "💡 **Tip:** Your budget burn rate is currently high. We suggest deferring non-essential Shopping or Entertainment logs to next month.";
            } else {
                reply = "💡 **Tip:** Your spending speed is healthy! Consider setting up a target goal to direct 15% of your checking balance automatically to your savings vault.";
            }
        } else {
            const category_sums = {};
            txs.forEach(t => {
                if (t.type === 'expense') {
                    category_sums[t.category] = (category_sums[t.category] || 0) + parseFloat(t.amount);
                }
            });
            const categories = Object.keys(category_sums);
            if (categories.length > 0) {
                const top_cat = categories.reduce((a, b) => category_sums[a] > category_sums[b] ? a : b);
                const top_val = category_sums[top_cat];
                reply = `I parsed your ledgers! Your top expense category is **${top_cat}** with total spending of **$${top_val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}**. Ask me about savings, budget limits, or wallet balances for more specific answers!`;
            } else {
                reply = "I'm not sure how to answer that question. Try asking about your **savings rate**, **remaining budget**, **account balances**, or active **milestone goals**!";
            }
        }
        
        return jsonResponse({ reply });
    }
    
    return jsonResponse({ error: "Endpoint mock not implemented" }, 404);
}

window.fetch = async function(url, options) {
    if (USE_LOCAL_STORAGE && typeof url === 'string' && url.startsWith(API_BASE)) {
        return mockFetch(url, options);
    }
    return originalFetch(url, options);
};

checkBackendAvailability();

let transactionDatabase = [];

let activeViewFilter = 'dashboard';
let currentSystemCurrency = 'INR';
let systemBudgetLimit = 2000.00;
let txSortKey = 'date';
let txSortDirection = 'desc';

const CATEGORY_COLORS = {
    'Salary': '#10b981',
    'Freelance': '#3b82f6',
    'Food & Dining': '#ef4444',
    'Transport': '#f59e0b',
    'Utilities': '#8b5cf6',
    'Shopping': '#ec4899',
    'Entertainment': '#06b6d4',
    'Transfer': '#a855f7',
    'Others': '#64748b'
};

// CONVERSION LAYER RATIO (1 USD = 83.50 INR equivalent)
const EXCHANGE_RATE_MULTIPLIER = 83.50;

// --- 1. AUTH SYSTEM ENGINE (WITH REAL STORAGE MECHANISMS) ---
function toggleAuthMode(targetScreen) {
    if (targetScreen === 'signup') {
        document.getElementById('login-card').classList.add('hidden');
        document.getElementById('signup-card').classList.remove('hidden');
    } else {
        document.getElementById('signup-card').classList.add('hidden');
        document.getElementById('login-card').classList.remove('hidden');
    }
}

async function handleSignupSubmit(event) {
    event.preventDefault();

    const nameVal = document.getElementById('signup-name').value;
    const emailVal = document.getElementById('signup-email').value;
    const passVal = document.getElementById('signup-password').value;

    try {
        const response = await fetch(`${API_BASE}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: nameVal, email: emailVal, password: passVal })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        alert('Registration Completed successfully! You can log in now.');
        toggleAuthMode('login');
    } catch (err) {
        alert('Signup Error: ' + err.message);
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const emailInput = document.getElementById('login-email').value;
    const passInput = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput, password: passInput })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Authentication failed');
        }

        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_name', data.user.name);
        localStorage.setItem('user_email', data.user.email);
        localStorage.setItem('user_phone', data.user.phone_number || '');
        localStorage.setItem('user_avatar', data.user.avatar || '');
        localStorage.setItem('user_address', data.user.address || '');

        loadUserProfileDetails();

        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        switchTab('dashboard');
        await fetchAndRenderTransactions();
        checkAndShowOnboarding();
    } catch (err) {
        alert('Authentication Error: ' + err.message);
    }
}

function handleLogout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_email');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('auth-container').classList.remove('hidden');
}

async function fetchAndRenderTransactions() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/transactions`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            if (response.status === 401) {
                handleLogout();
                return;
            }
            throw new Error('Failed to fetch transactions');
        }
        transactionDatabase = await response.json();
        console.log("[MyFin Debug] Fetched transactionDatabase:", transactionDatabase);
        window.debugTransactions = transactionDatabase;
        renderApplicationData();

        // Silently sync bank account selectors in background
        fetchAndRenderAccounts(activeViewFilter === 'accounts');

        // Also refresh AI suggestions in the background if AI tab is open
        if (activeViewFilter === 'ai-advisor') {
            fetchAISuggestions();
        }

        if (activeViewFilter === 'goals') {
            fetchAndRenderGoals();
        }
    } catch (err) {
        console.error('Error fetching transactions:', err);
    }
}

// --- 2. LIVE CURRENCY MANAGEMENT CONTROLLER ---
function formatCurrencyString(numericAmount) {
    if (currentSystemCurrency === 'INR') {
        let inrValue = numericAmount * EXCHANGE_RATE_MULTIPLIER;
        return `₹${inrValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    // Return baseline USD representation defaults
    return `$${numericAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function handleCurrencyConversionChange() {
    // Collect dropdown current context option state
    currentSystemCurrency = document.getElementById('currency-toggle-select').value;
    localStorage.setItem('system_currency', currentSystemCurrency);

    // Update the budget limit input dynamically
    updateBudgetLimitInputDisplay();

    // Cycle structural standalone text fields and map conversion values
    const stationaryHooks = document.querySelectorAll('.conversions-hook');
    stationaryHooks.forEach(hookElement => {
        let baseNum = parseFloat(hookElement.getAttribute('data-base'));
        hookElement.textContent = formatCurrencyString(baseNum);
    });

    // Recompute calculations matrix
    renderApplicationData();
}

// --- 3. DYNAMIC DATA AND AGGREGATION RENDERING ENGINE ---
function renderApplicationData() {
    let incomeSum = 0;
    let expenseSum = 0;

    transactionDatabase.forEach(tx => {
        if (tx.type === 'income') {
            incomeSum += tx.amount;
        } else {
            expenseSum += tx.amount;
        }
    });

    if (activeViewFilter === 'dashboard') {
        renderDashboardView(incomeSum, expenseSum);
    } else if (activeViewFilter === 'transactions') {
        renderTransactionsView();
    } else if (activeViewFilter === 'income') {
        renderIncomeView(incomeSum);
    } else if (activeViewFilter === 'expenses') {
        renderExpensesView(expenseSum);
    } else if (activeViewFilter === 'reports') {
        renderReportsView();
    }
}

function renderDashboardView(incomeSum, expenseSum) {
    document.getElementById('dashboard-sum-income').textContent = formatCurrencyString(incomeSum);
    document.getElementById('dashboard-sum-expense').textContent = formatCurrencyString(expenseSum);
    document.getElementById('dashboard-sum-balance').textContent = formatCurrencyString(incomeSum - expenseSum);

    // Days Left calculation
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const daysLeft = totalDays - now.getDate();
    document.getElementById('dashboard-days-left').textContent = `🗓️ ${daysLeft} Days Left`;

    // Monthly Salary calculation
    let totalSalary = 0;
    transactionDatabase.forEach(tx => {
        if (tx.type === 'income' && tx.category === 'Salary') {
            totalSalary += tx.amount;
        }
    });
    if (totalSalary === 0) {
        totalSalary = incomeSum || 0.0;
    }

    document.getElementById('dashboard-salary-ratio').textContent = `${formatCurrencyString(expenseSum)} / ${formatCurrencyString(totalSalary)}`;
    const progressPct = totalSalary > 0 ? Math.min(100, Math.round((expenseSum / totalSalary) * 100)) : 0;
    const salaryProgressBar = document.getElementById('dashboard-salary-progress');
    salaryProgressBar.style.width = `${progressPct}%`;
    if (progressPct >= 95) {
        salaryProgressBar.className = 'progress-bar bar-danger';
    } else if (progressPct >= 75) {
        salaryProgressBar.className = 'progress-bar bar-warning';
    } else {
        salaryProgressBar.className = 'progress-bar bar-success';
    }

    // Recent Transactions
    const recentTxList = document.getElementById('dashboard-recent-tx-list');
    if (recentTxList) {
        recentTxList.innerHTML = '';

        const recentTxs = [...transactionDatabase]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);

        if (recentTxs.length === 0) {
            recentTxList.innerHTML = `
                <div class="recent-tx-empty-3d">
                    <div class="empty-doc-wrapper">
                        <div class="empty-doc-3d">
                            <div class="empty-doc-line"></div>
                            <div class="empty-doc-line"></div>
                            <div class="empty-doc-line"></div>
                        </div>
                        <div class="empty-doc-sphere sphere-left"></div>
                        <div class="empty-doc-sphere sphere-right"></div>
                    </div>
                </div>
            `;
        } else {
            recentTxs.forEach(tx => {
                const iconClass = tx.type === 'income' ? 'fa-arrow-down' : 'fa-arrow-up';
                const wrapperClass = tx.type === 'income' ? 'recent-tx-icon-income' : 'recent-tx-icon-expense';
                const amountColor = tx.type === 'income' ? 'var(--success)' : 'var(--danger)';
                const prefix = tx.type === 'income' ? '+' : '-';
                const formattedAmt = formatCurrencyString(tx.amount);

                const itemHTML = `
                    <div class="recent-tx-row" onclick="showTransactionDetails(${tx.id})">
                        <div class="recent-tx-left">
                            <div class="recent-tx-icon-wrapper ${wrapperClass}">
                                <i class="fa-solid ${iconClass}"></i>
                            </div>
                            <div class="recent-tx-details">
                                <span class="recent-tx-desc">${tx.desc}</span>
                                <span class="recent-tx-meta">${tx.date} • ${tx.category}</span>
                            </div>
                        </div>
                        <div class="recent-tx-right">
                            <span class="recent-tx-amount" style="color: ${amountColor};">${prefix}${formattedAmt}</span>
                            <span style="font-size: 0.7rem; color: var(--text-muted);"><i class="fa-solid fa-university"></i> ${tx.account_name || 'None'}</span>
                        </div>
                    </div>
                `;
                recentTxList.innerHTML += itemHTML;
            });
        }
    }

    // Quick Account Access list in Dashboard matching Panel 1
    const dashboardAccountsList = document.getElementById('dashboard-accounts-list');
    if (dashboardAccountsList) {
        dashboardAccountsList.innerHTML = '';
        const accountsToShow = bankAccountsDatabase && bankAccountsDatabase.length >= 2 ? bankAccountsDatabase.slice(0, 2) : [
            { name: "Primary Checking", type: "Bank Account", balance: 12840.00 },
            { name: "Savings Account", type: "Bank Account", balance: 40920.00 }
        ];

        dashboardAccountsList.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 10px;">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 18px; border-radius: 16px; box-shadow: 0 10px 24px -4px rgba(37, 99, 235, 0.4); cursor: pointer; transition: transform 0.2s ease;" onclick="switchTab('accounts')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.8rem; font-weight: 700; opacity: 0.95;">${accountsToShow[0].name}</span>
                        <div style="width: 26px; height: 26px; border-radius: 8px; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">
                            <i class="fa-solid fa-credit-card"></i>
                        </div>
                    </div>
                    <div style="font-size: 1.45rem; font-weight: 900; letter-spacing: -0.5px;">${formatCurrencyString(accountsToShow[0].balance)}</div>
                    <div style="font-size: 0.72rem; opacity: 0.85; margin-top: 4px;">Bank Account</div>
                </div>
                <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: white; padding: 16px 18px; border-radius: 16px; box-shadow: 0 10px 24px -4px rgba(139, 92, 246, 0.4); cursor: pointer; transition: transform 0.2s ease;" onclick="switchTab('accounts')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.8rem; font-weight: 700; opacity: 0.95;">${accountsToShow[1].name}</span>
                        <div style="width: 26px; height: 26px; border-radius: 8px; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">
                            <i class="fa-solid fa-vault"></i>
                        </div>
                    </div>
                    <div style="font-size: 1.45rem; font-weight: 900; letter-spacing: -0.5px;">${formatCurrencyString(accountsToShow[1].balance)}</div>
                    <div style="font-size: 0.72rem; opacity: 0.85; margin-top: 4px;">Bank Account</div>
                </div>
            </div>
        `;
    }

    // Expense categories breakdown with unique colors
    const expenseCategoriesContainer = document.getElementById('dashboard-expense-categories');
    if (expenseCategoriesContainer) {
        expenseCategoriesContainer.innerHTML = '';

        const expenseTxs = transactionDatabase.filter(tx => tx.type === 'expense');
        let categoryExpenses = {};
        let totalExpenses = 0;
        expenseTxs.forEach(tx => {
            categoryExpenses[tx.category] = (categoryExpenses[tx.category] || 0) + tx.amount;
            totalExpenses += tx.amount;
        });

        if (expenseTxs.length === 0) {
            expenseCategoriesContainer.innerHTML = `
                <div style="display: flex; align-items: flex-end; justify-content: center; gap: 10px; padding: 25px 10px 10px;">
                    <div style="width: 22px; height: 30px; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, #93c5fd 0%, #60a5fa 100%); box-shadow: 0 4px 8px rgba(59,130,246,0.25);"></div>
                    <div style="width: 22px; height: 50px; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, #c4b5fd 0%, #a78bfa 100%); box-shadow: 0 4px 8px rgba(167,139,250,0.25);"></div>
                    <div style="width: 22px; height: 70px; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, #6ee7b7 0%, #34d399 100%); box-shadow: 0 4px 8px rgba(52,211,153,0.25);"></div>
                    <div style="width: 22px; height: 85px; border-radius: 6px 6px 0 0; background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%); box-shadow: 0 4px 8px rgba(37,99,235,0.3);"></div>
                    <div style="background: var(--glass-bg); padding: 8px 12px; border-radius: 12px; border: 1px solid var(--glass-border); margin-left: 14px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;"></span><div style="width: 40px; height: 4px; background: #e2e8f0; border-radius: 2px;"></div></div>
                        <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #f43f5e;"></span><div style="width: 32px; height: 4px; background: #e2e8f0; border-radius: 2px;"></div></div>
                        <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;"></span><div style="width: 48px; height: 4px; background: #e2e8f0; border-radius: 2px;"></div></div>
                    </div>
                </div>
            `;
        } else {
            const sortedCats = Object.entries(categoryExpenses).sort((a, b) => b[1] - a[1]);
            sortedCats.forEach(([cat, amt]) => {
                const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Others'];
                const itemHTML = `
                    <div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 600; margin-bottom: 4px;">
                            <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; display: inline-block;"></span> ${cat}</span>
                            <span>${formatCurrencyString(amt)} (${pct}%)</span>
                        </div>
                        <div class="progress-container" style="height: 7px; margin: 0; background: rgba(226, 232, 240, 0.7); border-radius: 4px;">
                            <div class="progress-bar" style="width: ${pct}%; background: ${color}; border-radius: 4px;"></div>
                        </div>
                    </div>
                `;
                expenseCategoriesContainer.innerHTML += itemHTML;
            });
        }
    }
}


// --- 3D CHART RENDER HELPERS ---
function renderBarChart(containerId, dataValues, barClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    const maxVal = Math.max(...dataValues, 100);
    
    container.innerHTML = months.map((m, idx) => {
        const val = dataValues[idx] || 0;
        const pct = Math.max(12, Math.round((val / maxVal) * 100));
        return `
            <div class="chart-bar-column" title="${m}: ${formatCurrencyString(val)}">
                <div class="chart-bar-pillar ${barClass}" style="height: ${pct}%;"></div>
                <span class="chart-month-label">${m}</span>
            </div>
        `;
    }).join('');
}

function renderDonutChart(svgId, legendId, centerAmountId, centerSubId, totalVal, slices) {
    const svg = document.getElementById(svgId);
    const legend = document.getElementById(legendId);
    const centerAmount = document.getElementById(centerAmountId);
    if (centerAmount) centerAmount.textContent = formatCurrencyString(totalVal);

    if (legend) {
        legend.innerHTML = slices.map(s => `
            <div class="donut-legend-row">
                <span style="display: flex; align-items: center; gap: 8px; color: var(--text-main);">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background: ${s.color}; display: inline-block;"></span>
                    ${s.label}
                </span>
                <span style="color: var(--text-muted); font-weight: 700;">${s.pct}%</span>
            </div>
        `).join('');
    }

    if (svg) {
        let accumulatedPercent = 0;
        const radius = 60;
        const circumference = 2 * Math.PI * radius;
        svg.innerHTML = slices.map(s => {
            const strokeDasharray = `${(s.pct / 100) * circumference} ${circumference}`;
            const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
            accumulatedPercent += s.pct;
            return `
                <circle cx="80" cy="80" r="${radius}" fill="none" stroke="${s.color}" stroke-width="20"
                    stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"
                    style="transition: stroke-dasharray 0.8s ease;" stroke-linecap="round"/>
            `;
        }).join('');
    }
}

function renderDualBarChart(containerId, incomeValues, expenseValues) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    const maxVal = Math.max(...incomeValues, ...expenseValues, 100);

    container.innerHTML = months.map((m, idx) => {
        const incVal = incomeValues[idx] || 0;
        const expVal = expenseValues[idx] || 0;
        const incPct = Math.max(10, Math.round((incVal / maxVal) * 100));
        const expPct = Math.max(10, Math.round((expVal / maxVal) * 100));
        return `
            <div class="chart-bar-column">
                <div class="dual-bar-pair">
                    <div class="dual-bar-pillar" style="height: ${incPct}%; background: linear-gradient(180deg, #60a5fa 0%, #2563eb 100%);" title="${m} Income: ${formatCurrencyString(incVal)}"></div>
                    <div class="dual-bar-pillar" style="height: ${expPct}%; background: linear-gradient(180deg, #fb7185 0%, #f43f5e 100%);" title="${m} Expense: ${formatCurrencyString(expVal)}"></div>
                </div>
                <span class="chart-month-label">${m}</span>
            </div>
        `;
    }).join('');
}

function renderTransactionsView() {
    const tableBody = document.getElementById('tx-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const searchInput = document.getElementById('tx-search-input');
    const catSelect = document.getElementById('tx-filter-category');
    const methodSelect = document.getElementById('tx-filter-method');

    const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const catVal = catSelect ? catSelect.value : 'all';
    const methodVal = methodSelect ? methodSelect.value : 'all';

    let filteredTxs = transactionDatabase.filter(tx => {
        const matchesSearch = !searchVal ||
            tx.desc.toLowerCase().includes(searchVal) ||
            tx.category.toLowerCase().includes(searchVal) ||
            (tx.account_name && tx.account_name.toLowerCase().includes(searchVal));

        const matchesCat = catVal === 'all' || tx.category === catVal;
        const matchesMethod = methodVal === 'all' || tx.method === methodVal;

        return matchesSearch && matchesCat && matchesMethod;
    });

    filteredTxs.sort((a, b) => {
        let valA, valB;
        if (txSortKey === 'date') {
            valA = new Date(a.date);
            valB = new Date(b.date);
        } else {
            valA = a.amount;
            valB = b.amount;
        }

        if (txSortDirection === 'asc') {
            return valA > valB ? 1 : (valA < valB ? -1 : 0);
        } else {
            return valA < valB ? 1 : (valA > valB ? -1 : 0);
        }
    });

    const dateArrow = document.getElementById('sort-icon-date');
    const amountArrow = document.getElementById('sort-icon-amount');

    if (dateArrow && amountArrow) {
        if (txSortKey === 'date') {
            dateArrow.textContent = txSortDirection === 'asc' ? '▲' : '▼';
            dateArrow.style.color = 'var(--primary)';
            amountArrow.textContent = '↕';
            amountArrow.style.color = 'var(--text-muted)';
        } else {
            amountArrow.textContent = txSortDirection === 'asc' ? '▲' : '▼';
            amountArrow.style.color = 'var(--primary)';
            dateArrow.textContent = '↕';
            dateArrow.style.color = 'var(--text-muted)';
        }
    }

    if (filteredTxs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px; font-weight: 500;">No transactions matching your criteria.</td></tr>`;
        return;
    }

    filteredTxs.forEach(tx => {
        const sign = tx.type === 'income' ? '+' : '-';
        const typePillClass = tx.type === 'income' ? 'badge-pct-green' : 'badge-pct-red';
        const amountColor = tx.type === 'income' ? 'var(--success)' : 'var(--danger)';
        const categoryColor = CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Others'] || '#3b82f6';
        const accountNameVal = tx.account_name || 'Checking';

        const rowHTML = `
            <tr style="cursor: pointer;" onclick="showTransactionDetails(${tx.id})">
                <td style="font-weight: 600; color: var(--text-muted);">${tx.date.substring(0, 10)}</td>
                <td style="font-weight: 700; color: var(--text-main);">${tx.desc}</td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.85rem;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${categoryColor}; display: inline-block;"></span>
                        ${tx.category}
                    </span>
                </td>
                <td style="font-weight: 600; color: var(--text-muted);">${accountNameVal}</td>
                <td style="font-weight: 800; color: ${amountColor};">
                    ${sign}${formatCurrencyString(tx.amount)}
                </td>
                <td>
                    <span class="pct-pill-badge ${typePillClass}" style="text-transform: capitalize;">
                        <span style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
                        ${tx.type}
                    </span>
                </td>
                <td onclick="event.stopPropagation()">
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="btn-dots-3d" onclick="showTransactionDetails(${tx.id})" title="View Receipt">
                            <i class="fa-solid fa-receipt"></i>
                        </button>
                        <button class="btn-delete" onclick="removeTransactionRecord(${tx.id})" title="Delete Record">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tableBody.innerHTML += rowHTML;
    });
}

function handleTxSearchAndFilter() {
    renderTransactionsView();
}

function resetTxFilters() {
    const searchInput = document.getElementById('tx-search-input');
    const catSelect = document.getElementById('tx-filter-category');
    const methodSelect = document.getElementById('tx-filter-method');
    if (searchInput) searchInput.value = '';
    if (catSelect) catSelect.value = 'all';
    if (methodSelect) methodSelect.value = 'all';
    renderTransactionsView();
}

function toggleTxSort(key) {
    if (txSortKey === key) {
        txSortDirection = txSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        txSortKey = key;
        txSortDirection = 'desc';
    }
    renderTransactionsView();
}

function renderIncomeView(incomeSum) {
    const incomeTxs = transactionDatabase.filter(tx => tx.type === 'income');
    const totalEntries = incomeTxs.length;
    const thisMonthSum = incomeSum > 0 ? incomeSum : 24000;
    const avgMonthly = totalEntries > 0 ? (incomeSum / Math.max(1, totalEntries)) : 22300;

    const sumTotalEl = document.getElementById('income-sum-total');
    const thisMonthEl = document.getElementById('income-this-month-val');
    const avgDepositEl = document.getElementById('income-avg-deposit');
    const totalEntriesEl = document.getElementById('income-total-entries');

    if (sumTotalEl) sumTotalEl.textContent = formatCurrencyString(incomeSum || 24500);
    if (thisMonthEl) thisMonthEl.textContent = formatCurrencyString(thisMonthSum);
    if (avgDepositEl) avgDepositEl.textContent = formatCurrencyString(avgMonthly);
    if (totalEntriesEl) totalEntriesEl.textContent = String(totalEntries || 3);

    // Render Income Trend Bar Chart (Jan - Oct)
    const incomeTrendData = [12000, 16000, 14000, 22000, 18000, 26000, 24000, 32000, 28000, incomeSum > 0 ? incomeSum : 35000];
    renderBarChart('income-bar-chart-container', incomeTrendData, 'bar-blue');

    // Render Income Sources Donut Chart
    const incomeSlices = [
        { label: 'Salary', pct: 78, color: '#2563eb' },
        { label: 'Freelance', pct: 12, color: '#38bdf8' },
        { label: 'Investments', pct: 6, color: '#8b5cf6' },
        { label: 'Others', pct: 4, color: '#94a3b8' }
    ];
    renderDonutChart('income-donut-svg', 'income-donut-legend', 'income-donut-amount', 'income-donut-sub', incomeSum || 24500, incomeSlices);

    // Render Income Streams Ledger
    const tableBody = document.getElementById('income-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (incomeTxs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No income records found.</td></tr>`;
        return;
    }

    incomeTxs.forEach(tx => {
        const methodVal = tx.method || 'Bank Transfer';
        const accountNameVal = tx.account_name || 'Checking';

        const rowHTML = `
            <tr style="cursor: pointer;" onclick="showTransactionDetails(${tx.id})">
                <td style="font-weight:600; color:var(--text-muted);">${tx.date.substring(0, 10)}</td>
                <td style="font-weight:700; color:var(--text-main);">${tx.desc}</td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.85rem;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
                        ${tx.category}
                    </span>
                </td>
                <td style="font-weight:600; color:var(--text-muted);">${accountNameVal}</td>
                <td style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">${methodVal}</td>
                <td style="font-weight:800; color: var(--success)">
                    +${formatCurrencyString(tx.amount)}
                </td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-delete" onclick="removeTransactionRecord(${tx.id})" title="Delete Record">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
        tableBody.innerHTML += rowHTML;
    });
}

function renderExpensesView(expenseSum) {
    const expenseTxs = transactionDatabase.filter(tx => tx.type === 'expense');
    const totalEntries = expenseTxs.length;
    const thisMonthSum = expenseSum > 0 ? expenseSum : 18200;
    const avgMonthly = totalEntries > 0 ? (expenseSum / Math.max(1, totalEntries)) : 16500;

    const sumTotalEl = document.getElementById('expense-sum-total');
    const thisMonthEl = document.getElementById('expense-this-month-val');
    const avgMonthlyEl = document.getElementById('expense-avg-monthly');
    const totalEntriesEl = document.getElementById('expense-total-entries');

    if (sumTotalEl) sumTotalEl.textContent = formatCurrencyString(expenseSum || 18200);
    if (thisMonthEl) thisMonthEl.textContent = formatCurrencyString(thisMonthSum);
    if (avgMonthlyEl) avgMonthlyEl.textContent = formatCurrencyString(avgMonthly);
    if (totalEntriesEl) totalEntriesEl.textContent = String(totalEntries || 12);

    // Render Expense Trend Bar Chart (Jan - Oct)
    const expenseTrendData = [10000, 14000, 18000, 12000, 20000, 16000, 22000, 24000, 19000, expenseSum > 0 ? expenseSum : 25000];
    renderBarChart('expense-bar-chart-container', expenseTrendData, 'bar-coral');

    // Render Expenses by Category Donut Chart
    const expenseSlices = [
        { label: 'Food & Dining', pct: 28, color: '#2563eb' },
        { label: 'Shopping', pct: 22, color: '#38bdf8' },
        { label: 'Bills & Utilities', pct: 18, color: '#8b5cf6' },
        { label: 'Transport', pct: 12, color: '#f59e0b' },
        { label: 'Others', pct: 20, color: '#f43f5e' }
    ];
    renderDonutChart('expense-donut-svg', 'expense-donut-legend', 'expense-donut-amount', 'expense-donut-sub', expenseSum || 18200, expenseSlices);

    // Render Expenses Ledger Table
    const tableBody = document.getElementById('expense-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (expenseTxs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No expense records found.</td></tr>`;
        return;
    }

    expenseTxs.forEach(tx => {
        const methodVal = tx.method || 'Bank Transfer';
        const accountNameVal = tx.account_name || 'Checking';
        const categoryColor = CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Others'] || '#f43f5e';

        const rowHTML = `
            <tr style="cursor: pointer;" onclick="showTransactionDetails(${tx.id})">
                <td style="font-weight:600; color:var(--text-muted);">${tx.date.substring(0, 10)}</td>
                <td style="font-weight:700; color:var(--text-main);">${tx.desc}</td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.85rem;">
                        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${categoryColor}; display: inline-block;"></span>
                        ${tx.category}
                    </span>
                </td>
                <td style="font-weight:600; color:var(--text-muted);">${accountNameVal}</td>
                <td style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">${methodVal}</td>
                <td style="font-weight:800; color: var(--danger)">
                    -${formatCurrencyString(tx.amount)}
                </td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-delete" onclick="removeTransactionRecord(${tx.id})" title="Delete Record">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
        tableBody.innerHTML += rowHTML;
    });
}

function renderReportsView() {
    let incomeSum = 0;
    let expenseSum = 0;
    transactionDatabase.forEach(tx => {
        if (tx.type === 'income') incomeSum += tx.amount;
        else expenseSum += tx.amount;
    });

    const netSavings = incomeSum - expenseSum;
    const savingsRate = incomeSum > 0 ? ((netSavings / incomeSum) * 100).toFixed(1) : '25.7';

    const repIncome = document.getElementById('reports-total-income');
    const repExpense = document.getElementById('reports-total-expense');
    const repSavings = document.getElementById('reports-net-savings');
    const repRate = document.getElementById('reports-savings-rate');

    if (repIncome) repIncome.textContent = formatCurrencyString(incomeSum || 24500);
    if (repExpense) repExpense.textContent = formatCurrencyString(expenseSum || 18200);
    if (repSavings) repSavings.textContent = formatCurrencyString(netSavings > 0 ? netSavings : 6300);
    if (repRate) repRate.textContent = `${savingsRate}%`;

    // Render Dual Paired Bar Chart
    const incomeMonths = [12000, 16000, 14000, 22000, 18000, 26000, 24000, 32000, 28000, incomeSum || 24500];
    const expenseMonths = [10000, 14000, 18000, 12000, 20000, 16000, 22000, 24000, 19000, expenseSum || 18200];
    renderDualBarChart('reports-dual-bar-chart', incomeMonths, expenseMonths);

    // Render Top Expense Categories Horizontal Progress Bars
    const topCatsContainer = document.getElementById('reports-top-categories-list');
    if (topCatsContainer) {
        const topCategories = [
            { cat: 'Food & Dining', pct: 28, color: '#3b82f6' },
            { cat: 'Shopping', pct: 22, color: '#8b5cf6' },
            { cat: 'Bills & Utilities', pct: 18, color: '#ec4899' },
            { cat: 'Transport', pct: 12, color: '#f59e0b' },
            { cat: 'Entertainment', pct: 10, color: '#06b6d4' }
        ];

        topCatsContainer.innerHTML = topCategories.map(item => `
            <div>
                <div style="display: flex; justify-content: space-between; font-size: 0.84rem; font-weight: 700; margin-bottom: 6px;">
                    <span style="color: var(--text-main);">${item.cat}</span>
                    <span style="color: var(--text-muted);">${item.pct}%</span>
                </div>
                <div style="height: 10px; background: rgba(226, 232, 240, 0.7); border-radius: var(--radius-pill); overflow: hidden;">
                    <div style="width: ${item.pct}%; height: 100%; border-radius: var(--radius-pill); background: ${item.color}; transition: width 0.6s ease;"></div>
                </div>
            </div>
        `).join('');
    }
}

function switchReportsSubTab(subTabName) {
    const buttons = document.querySelectorAll('#view-reports .subnav-pill-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

function switchSettingsSubTab(subTabName) {
    const buttons = document.querySelectorAll('#view-settings .subnav-pill-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

function showTransactionDetails(id) {
    const tx = transactionDatabase.find(t => t.id === id);
    if (!tx) return;

    document.getElementById('receipt-tx-id').textContent = `TX ID: #100${tx.id}`;
    document.getElementById('receipt-desc').textContent = tx.desc;
    document.getElementById('receipt-date').textContent = tx.date;

    const catBadge = document.getElementById('receipt-category');
    catBadge.textContent = tx.category;
    catBadge.className = 'badge ' + (tx.type === 'income' ? 'bg-income' : 'bg-expense');

    const typeEl = document.getElementById('receipt-type');
    typeEl.textContent = tx.type;
    typeEl.style.color = tx.type === 'income' ? 'var(--success)' : 'var(--danger)';

    document.getElementById('receipt-method').textContent = tx.method || 'Bank Transfer';
    document.getElementById('receipt-account').textContent = tx.account_name || 'None';

    const amtEl = document.getElementById('receipt-amount');
    const formattedAmt = formatCurrencyString(tx.amount);
    amtEl.textContent = (tx.type === 'income' ? '+' : '-') + formattedAmt;
    amtEl.style.color = tx.type === 'income' ? 'var(--success)' : 'var(--danger)';

    let inrVal = tx.amount * EXCHANGE_RATE_MULTIPLIER;
    document.getElementById('receipt-inr-conversion').textContent = '₹' + inrVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' INR equivalent';

    document.getElementById('tx-detail-modal').classList.remove('hidden');
}

function hideTransactionDetails() {
    document.getElementById('tx-detail-modal').classList.add('hidden');
}

function showAccountBalancesBreakdown() {
    const container = document.getElementById('acc-balances-modal-list');
    container.innerHTML = '';

    if (bankAccountsDatabase.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 15px;">No registered accounts available.</p>`;
    } else {
        bankAccountsDatabase.forEach(acc => {
            const rowHTML = `
                <div class="balance-breakdown-row">
                    <div>
                        <h4 style="margin: 0; font-weight:600;"><i class="fa-solid fa-university" style="margin-right: 6px; color: var(--primary);"></i>${acc.name}</h4>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${acc.type}</span>
                    </div>
                    <span style="font-weight: 700; font-size: 1.05rem;">${formatCurrencyString(acc.balance)}</span>
                </div>
            `;
            container.innerHTML += rowHTML;
        });
    }

    document.getElementById('acc-balances-modal').classList.remove('hidden');
}

function hideAccountBalancesBreakdown() {
    document.getElementById('acc-balances-modal').classList.add('hidden');
}

// --- 4. FORM AND DATA SUBMISSION PIPELINES ---
function showTransactionForm(preferredType) {
    const modal = document.getElementById('tx-form-modal');
    if (modal) modal.classList.remove('hidden');
    if (preferredType) {
        const typeSelect = document.getElementById('tx-type');
        if (typeSelect) {
            typeSelect.value = preferredType;
            handleTxTypeChange();
        }
    }
}
function hideTransactionForm() {
    document.getElementById('tx-form-modal').classList.add('hidden');
    document.getElementById('tx-category-custom-group').classList.add('hidden');
    document.getElementById('tx-category-custom').value = '';
    document.getElementById('tx-category').value = 'Salary';
}

function handleTxCategoryChange() {
    const catSelect = document.getElementById('tx-category');
    const customGroup = document.getElementById('tx-category-custom-group');
    const customInput = document.getElementById('tx-category-custom');

    if (catSelect.value === 'Others') {
        customGroup.classList.remove('hidden');
        customInput.setAttribute('required', 'true');
        customInput.focus();
    } else {
        customGroup.classList.add('hidden');
        customInput.removeAttribute('required');
        customInput.value = '';
    }
}

function handleTxTypeChange() {
    const typeSelect = document.getElementById('tx-type');
    const catSelect = document.getElementById('tx-category');
    if (!typeSelect || !catSelect) return;

    if (typeSelect.value === 'expense') {
        if (catSelect.value === 'Salary' || catSelect.value === 'Freelance') {
            catSelect.value = 'Food & Dining';
        }
    } else if (typeSelect.value === 'income') {
        if (catSelect.value !== 'Salary' && catSelect.value !== 'Freelance' && catSelect.value !== 'Others') {
            catSelect.value = 'Salary';
        }
    }
    handleTxCategoryChange();
}

window.handleTxTypeChange = handleTxTypeChange;

async function addNewTransaction(event) {
    event.preventDefault();

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const descInput = document.getElementById('tx-desc').value;
    let amtInput = parseFloat(document.getElementById('tx-amount').value);
    const typeInput = document.getElementById('tx-type').value;
    let catInput = document.getElementById('tx-category').value;
    if (catInput === 'Others') {
        catInput = document.getElementById('tx-category-custom').value.trim() || 'Others';
    }
    const methodInput = document.getElementById('tx-method').value;
    const accountInput = document.getElementById('tx-account-select').value;

    // If adding transaction while viewing in INR mode, divide to save inside core USD matrix dataset accurately
    if (currentSystemCurrency === 'INR') {
        amtInput = amtInput / EXCHANGE_RATE_MULTIPLIER;
    }

    try {
        const response = await fetch(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                desc: descInput,
                amount: amtInput,
                type: typeInput,
                category: catInput,
                method: methodInput,
                account_id: accountInput ? parseInt(accountInput) : null
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create transaction');
        }

        hideTransactionForm();
        document.getElementById('tx-desc').value = '';
        document.getElementById('tx-amount').value = '';

        await fetchAndRenderTransactions();
    } catch (err) {
        alert('Error adding transaction: ' + err.message);
    }
}

async function removeTransactionRecord(idNum) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
        const response = await fetch(`${API_BASE}/transactions/${idNum}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to delete transaction');
        }

        await fetchAndRenderTransactions();
    } catch (err) {
        alert('Error deleting transaction: ' + err.message);
    }
}

const VIEW_METADATA = {
    'dashboard': { title: 'Dashboard', subtitle: 'Overview of your finances' },
    'transactions': { title: 'Transactions', subtitle: 'View and manage all your transactions' },
    'income': { title: 'Income', subtitle: 'Track and analyze your income sources' },
    'expenses': { title: 'Expenses', subtitle: 'Track and analyze your spending' },
    'accounts': { title: 'Accounts', subtitle: 'Manage your bank accounts and wallets' },
    'reports': { title: 'Reports', subtitle: 'Detailed insights into your financial activity' },
    'goals': { title: 'Goals', subtitle: 'Set and track your financial goals' },
    'settings': { title: 'Settings', subtitle: 'Manage your account and preferences' },
    'ai-advisor': { title: 'AI Advisor', subtitle: 'Get personalized financial insights' },
    'scan-pay': { title: 'Scan to Pay', subtitle: 'Make instant payments using QR code' }
};

// --- 5. INTERFACE PANEL TAB MANAGEMENT ENG ROUTER ---
function switchTab(viewName) {
    closeSidebarOnMobile();
    // Release webcam tracks if navigating away from Scanner view
    if (viewName !== 'scan-pay') {
        stopWebcamStream();
    }

    activeViewFilter = viewName;

    const menuButtons = document.querySelectorAll('.sidebar-menu .menu-item');
    menuButtons.forEach(btn => btn.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('menu-item')) {
        event.currentTarget.classList.add('active');
    } else {
        menuButtons.forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(`'${viewName}'`)) {
                btn.classList.add('active');
            }
        });
    }

    const meta = VIEW_METADATA[viewName] || { title: viewName.charAt(0).toUpperCase() + viewName.slice(1), subtitle: 'Financial overview' };
    const pageTitleEl = document.getElementById('page-title');
    const pageSubEl = document.getElementById('page-subtitle');
    if (pageTitleEl) pageTitleEl.textContent = meta.title;
    if (pageSubEl) pageSubEl.textContent = meta.subtitle;

    // Control header actions button visibility dynamically
    const btnGuide = document.getElementById('header-btn-guide');
    const btnAddTx = document.getElementById('header-btn-add-tx');
    const btnAddIncome = document.getElementById('header-btn-add-income');
    const btnAddExpense = document.getElementById('header-btn-add-expense');
    const btnAddAcc = document.getElementById('header-btn-add-account');
    const btnAddGoal = document.getElementById('header-btn-add-goal');
    const btnScanPay = document.getElementById('header-btn-scan-pay');

    if (btnGuide) btnGuide.classList.remove('hidden'); // Guide is always present
    if (btnAddTx) btnAddTx.classList.add('hidden');
    if (btnAddIncome) btnAddIncome.classList.add('hidden');
    if (btnAddExpense) btnAddExpense.classList.add('hidden');
    if (btnAddAcc) btnAddAcc.classList.add('hidden');
    if (btnAddGoal) btnAddGoal.classList.add('hidden');
    if (btnScanPay) btnScanPay.classList.add('hidden');

    if (viewName === 'transactions') {
        if (btnAddTx) btnAddTx.classList.remove('hidden');
    } else if (viewName === 'income') {
        if (btnAddIncome) btnAddIncome.classList.remove('hidden');
    } else if (viewName === 'expenses') {
        if (btnAddExpense) btnAddExpense.classList.remove('hidden');
    } else if (viewName === 'accounts') {
        if (btnAddAcc) btnAddAcc.classList.remove('hidden');
    } else if (viewName === 'goals') {
        if (btnAddGoal) btnAddGoal.classList.remove('hidden');
    } else {
        if (btnScanPay) btnScanPay.classList.remove('hidden');
    }

    const allPanels = ['view-dashboard', 'view-transactions', 'view-income', 'view-expenses', 'view-accounts', 'view-reports', 'view-goals', 'view-settings', 'view-ai-advisor', 'view-scan-pay'];
    allPanels.forEach(panelId => {
        const el = document.getElementById(panelId);
        if (el) el.classList.add('hidden');
    });

    const activePanel = document.getElementById(`view-${viewName}`);
    if (activePanel) {
        activePanel.classList.remove('hidden');
    }

    if (viewName === 'ai-advisor') {
        fetchAISuggestions();
    } else if (viewName === 'scan-pay') {
        updateScanPlaceholderAmount();
        renderScanRecentPayments();
        if (activeScanSource === 'myqr') {
            populateMyQRDropdown();
        }
    } else if (viewName === 'accounts') {
        fetchAndRenderAccounts(true);
    } else if (viewName === 'goals') {
        fetchAndRenderGoals();
    } else if (viewName === 'settings') {
        loadUserProfileDetails();
        renderApplicationData();
    } else {
        renderApplicationData();
    }
}

function updateThemeLabel(isDark) {
    const labelSpan = document.querySelector('.dark-mode-widget span');
    if (labelSpan) {
        if (isDark) {
            labelSpan.innerHTML = '<i class="fa-solid fa-sun"></i> Light Mode';
        } else {
            labelSpan.innerHTML = '<i class="fa-solid fa-moon"></i> Dark Mode';
        }
    }
}

function toggleDarkTheme() {
    const isChecked = document.getElementById('dark-theme-checkbox').checked;
    document.body.classList.toggle('dark-mode', isChecked);
    localStorage.setItem('dark_theme', isChecked ? 'true' : 'false');
    updateThemeLabel(isChecked);
}

// --- WELCOME ONBOARDING GUIDE MODAL ---
let activeOnboardSlide = 0;
const totalOnboardSlides = 5;

function showWelcomeOnboardingModal() {
    activeOnboardSlide = 0;
    setOnboardingSlide(0);
    const modal = document.getElementById('welcome-onboarding-modal');
    if (modal) modal.classList.remove('hidden');
}

function hideWelcomeOnboardingModal() {
    const modal = document.getElementById('welcome-onboarding-modal');
    if (modal) modal.classList.add('hidden');
    localStorage.setItem('myfin_onboarded_v1', 'true');
}

function setOnboardingSlide(slideIndex) {
    activeOnboardSlide = slideIndex;

    for (let i = 0; i < totalOnboardSlides; i++) {
        const slide = document.getElementById(`onboard-slide-${i}`);
        if (slide) {
            if (i === slideIndex) {
                slide.classList.remove('hidden');
            } else {
                slide.classList.add('hidden');
            }
        }
    }

    const dots = document.querySelectorAll('.onboard-dot');
    dots.forEach((dot, idx) => {
        if (idx === slideIndex) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });

    const btnPrev = document.getElementById('btn-onboard-prev');
    const btnNext = document.getElementById('btn-onboard-next');

    if (btnPrev) {
        if (slideIndex === 0) {
            btnPrev.style.visibility = 'hidden';
        } else {
            btnPrev.style.visibility = 'visible';
        }
    }

    if (btnNext) {
        if (slideIndex === totalOnboardSlides - 1) {
            btnNext.textContent = 'Get Started!';
            btnNext.style.background = 'var(--success)';
            btnNext.style.borderColor = 'var(--success)';
        } else {
            btnNext.textContent = 'Next Step';
            btnNext.style.background = '';
            btnNext.style.borderColor = '';
        }
    }
}

function changeOnboardingSlide(direction) {
    let nextSlide = activeOnboardSlide + direction;
    if (nextSlide >= totalOnboardSlides) {
        hideWelcomeOnboardingModal();
        return;
    }
    if (nextSlide < 0) {
        nextSlide = 0;
    }
    setOnboardingSlide(nextSlide);
}

function checkAndShowOnboarding() {
    const onboardPref = localStorage.getItem('myfin_onboarded_v1');
    if (onboardPref !== 'true') {
        showWelcomeOnboardingModal();
    }
}

// On application boot, check if user is already logged in and apply theme
document.addEventListener('DOMContentLoaded', async () => {
    const darkThemePref = localStorage.getItem('dark_theme');
    const isDark = darkThemePref === 'true';
    const darkCheckbox = document.getElementById('dark-theme-checkbox');
    if (darkCheckbox) {
        darkCheckbox.checked = isDark;
    }
    document.body.classList.toggle('dark-mode', isDark);
    updateThemeLabel(isDark);

    const savedAccent = localStorage.getItem('theme_accent_color');
    const savedAccentName = localStorage.getItem('theme_accent_name');
    if (savedAccent && savedAccentName) {
        changeThemeAccent(savedAccent, savedAccentName);
    } else {
        changeThemeAccent('#4f46e5', 'indigo');
    }

    const savedCurrency = localStorage.getItem('system_currency') || 'INR';
    currentSystemCurrency = savedCurrency;
    const currencySelect = document.getElementById('currency-toggle-select');
    if (currencySelect) {
        currencySelect.value = savedCurrency;
    }

    const token = localStorage.getItem('auth_token');
    const name = localStorage.getItem('user_name');
    const email = localStorage.getItem('user_email');

    if (token && name && email) {
        loadUserProfileDetails();

        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        switchTab('dashboard');
        await fetchAndRenderTransactions();
        checkAndShowOnboarding();
    }
});

// --- BANK ACCOUNTS LEDGER CONTROLLER ---
let bankAccountsDatabase = [];

async function fetchAndRenderAccounts(shouldRenderCards = true) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/accounts`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch bank accounts');
        }
        bankAccountsDatabase = await response.json();

        // 1. Sync Links in Dropdowns
        const txSelect = document.getElementById('tx-account-select');
        const fromSelect = document.getElementById('transfer-from-select');
        const toSelect = document.getElementById('transfer-to-select');
        const scanOurGroup = document.getElementById('scan-our-accounts-group');

        const prevTxVal = txSelect ? txSelect.value : null;
        const prevFromVal = fromSelect ? fromSelect.value : null;
        const prevToVal = toSelect ? toSelect.value : null;

        if (txSelect) txSelect.innerHTML = '';
        if (fromSelect) fromSelect.innerHTML = '';
        if (toSelect) toSelect.innerHTML = '';
        if (scanOurGroup) scanOurGroup.innerHTML = '';

        bankAccountsDatabase.forEach(acc => {
            const optText = `${acc.name} (${acc.type})`;
            if (txSelect) txSelect.innerHTML += `<option value="${acc.id}">${optText}</option>`;
            if (fromSelect) fromSelect.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type})</option>`;
            if (toSelect) toSelect.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type})</option>`;
            if (scanOurGroup) {
                scanOurGroup.innerHTML += `<option value="${acc.name}" data-type="account" data-account-id="${acc.id}" data-cat="Others" data-amt="50.00">${acc.name} (${acc.type})</option>`;
            }
        });

        if (activeScanSource === 'myqr') {
            populateMyQRDropdown();
        }

        if (txSelect && prevTxVal) txSelect.value = prevTxVal;
        if (fromSelect && prevFromVal) fromSelect.value = prevFromVal;
        if (toSelect && prevToVal) toSelect.value = prevToVal;

        // 2. Render cards grid if Accounts view is active
        if (shouldRenderCards) {
            const grid = document.getElementById('accounts-cards-grid');
            if (grid) {
                grid.innerHTML = '';

                // If no accounts returned, provide the 4 rich initial defaults matching Panel 5
                const accountsToRender = (bankAccountsDatabase && bankAccountsDatabase.length > 0) ? bankAccountsDatabase : [
                    { id: 101, name: "Primary Checking", type: "Checking", balance: 12840.00, mask: "**** 1234" },
                    { id: 102, name: "Savings Account", type: "Savings", balance: 40920.00, mask: "**** 5678" },
                    { id: 103, name: "Cash Wallet", type: "Wallet", balance: 2350.00, mask: "Cash" },
                    { id: 104, name: "Credit Card", type: "Credit Card", balance: -8120.00, mask: "**** 9012" }
                ];

                const skinConfigs = [
                    { skin: 'skin-blue', badge: 'badge-blue', icon: '<i class="fa-solid fa-building-columns"></i>', tag: 'Bank Account', mask: '**** 1234' },
                    { skin: 'skin-purple', badge: 'badge-purple', icon: '<i class="fa-solid fa-vault"></i>', tag: 'Bank Account', mask: '**** 5678' },
                    { skin: 'skin-amber', badge: 'badge-amber', icon: '<i class="fa-solid fa-wallet"></i>', tag: 'Wallet', mask: 'Cash' },
                    { skin: 'skin-coral', badge: 'badge-coral', icon: '<i class="fa-regular fa-credit-card"></i>', tag: 'Credit Card', mask: '**** 9012' }
                ];

                accountsToRender.forEach((acc, idx) => {
                    const cfg = skinConfigs[idx % skinConfigs.length];
                    const isNeg = acc.balance < 0;
                    const displayAmt = isNeg ? `-₹${Math.abs(acc.balance).toLocaleString('en-IN')}` : `₹${acc.balance.toLocaleString('en-IN')}`;
                    const displayTag = acc.type === 'Wallet' ? 'Wallet' : (acc.type === 'Credit Card' ? 'Credit Card' : 'Bank Account');
                    const cardHTML = `
                        <div class="account-card-3d ${cfg.skin}">
                            <div class="acc-card-top">
                                <div class="icon-badge-3d ${cfg.badge}" style="width: 38px; height: 38px; font-size: 0.95rem;">
                                    ${cfg.icon}
                                </div>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <span class="acc-card-type-tag">${displayTag}</span>
                                    <button onclick="removeBankAccount(${acc.id})" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.82rem; padding: 2px; opacity: 0.7;" title="Delete Account">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                            </div>
                            <div style="margin: 12px 0 6px 0;">
                                <h4 class="acc-card-title">${acc.name}</h4>
                                <div class="acc-card-balance" style="${isNeg ? 'color: #f43f5e;' : ''}">${displayAmt}</div>
                                <div class="acc-card-number">${acc.mask || cfg.mask}</div>
                            </div>
                            <div class="acc-card-actions">
                                <button class="btn-acc-pill" onclick="showAccountQRModal(${acc.id}, '${acc.name.replace(/'/g, "\\'")}', '${acc.type}', ${acc.balance})"><i class="fa-solid fa-qrcode" style="margin-right: 4px;"></i> View</button>
                                <button class="btn-acc-pill" onclick="showAccountBalancesBreakdown()"><i class="fa-solid fa-sliders" style="margin-right: 4px;"></i> Manage</button>
                            </div>
                        </div>
                    `;
                    grid.innerHTML += cardHTML;
                });
            }
        }

        // Render Dashboard accounts if dashboard view is active
        if (activeViewFilter === 'dashboard') {
            let incomeSum = 0;
            let expenseSum = 0;
            transactionDatabase.forEach(tx => {
                if (tx.type === 'income') incomeSum += tx.amount;
                else expenseSum += tx.amount;
            });
            renderDashboardView(incomeSum, expenseSum);
        }
    } catch (err) {
        console.error('Accounts fetching error:', err);
    }
}

async function addNewBankAccount(event) {
    event.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const name = document.getElementById('acc-name-input').value;
    const type = document.getElementById('acc-type-input').value;
    let balance = parseFloat(document.getElementById('acc-bal-input').value);

    if (isNaN(balance)) {
        alert('Please enter a valid starting balance.');
        return;
    }

    if (currentSystemCurrency === 'INR') {
        balance = balance / EXCHANGE_RATE_MULTIPLIER;
    }

    try {
        const response = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, type, balance })
        });

        if (!response.ok) {
            throw new Error('Failed to create account ledger');
        }

        document.getElementById('acc-name-input').value = '';
        document.getElementById('acc-bal-input').value = '';

        await fetchAndRenderAccounts(true);
    } catch (err) {
        alert('Error creating account: ' + err.message);
    }
}

async function removeBankAccount(accId) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (!confirm('Are you sure you want to delete this bank account? All associated transaction histories will remain but lose their link.')) return;

    try {
        const response = await fetch(`${API_BASE}/accounts/${accId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete account');
        }

        await fetchAndRenderAccounts(true);
        await fetchAndRenderTransactions(); // Refresh transactions list
    } catch (err) {
        alert('Error deleting account: ' + err.message);
    }
}

async function executeInternalTransfer(event) {
    event.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const fromId = parseInt(document.getElementById('transfer-from-select').value);
    const toId = parseInt(document.getElementById('transfer-to-select').value);
    let amount = parseFloat(document.getElementById('transfer-amt-input').value);

    if (fromId === toId) {
        alert('Source and destination accounts must be different.');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid transfer amount.');
        return;
    }

    if (currentSystemCurrency === 'INR') {
        amount = amount / EXCHANGE_RATE_MULTIPLIER;
    }

    try {
        const response = await fetch(`${API_BASE}/accounts/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                from_account_id: fromId,
                to_account_id: toId,
                amount: amount
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to complete fund transfer');
        }

        alert('Internal fund transfer completed successfully!');
        document.getElementById('transfer-amt-input').value = '';

        await fetchAndRenderAccounts(true);
        await fetchAndRenderTransactions();
    } catch (err) {
        alert('Transfer Error: ' + err.message);
    }
}

// --- AI ADVISOR ENGINE ---
async function fetchAISuggestions() {
    let incomeSum = 0;
    let expenseSum = 0;

    transactionDatabase.forEach(tx => {
        if (tx.type === 'income') {
            incomeSum += tx.amount;
        } else {
            expenseSum += tx.amount;
        }
    });

    const netSavings = incomeSum - expenseSum;
    const savingsRate = incomeSum > 0 ? (netSavings / incomeSum * 100) : 0;

    let score = 75;
    if (netSavings < 0) {
        score -= 25;
    } else if (savingsRate > 20) {
        score += 15;
    } else {
        score += Math.round(savingsRate - 10);
    }
    score = Math.max(10, Math.min(100, score));

    const healthEl = document.getElementById('ai-chat-health-score');
    if (healthEl) {
        healthEl.textContent = score;
    }
}

// --- ACCOUNT QR CODE MODAL & SIMULATION & REAL SCAN ---
function showAccountQRModal(accountId, accountName, accountType, accountBalance) {
    const modal = document.getElementById('qr-code-modal');
    if (!modal) return;

    const nameEl = document.getElementById('qr-modal-acc-name');
    const detailsEl = document.getElementById('qr-modal-acc-details');
    const imgEl = document.getElementById('qr-modal-image');
    const btnSimulate = document.getElementById('btn-simulate-qr-scan');

    if (nameEl) nameEl.textContent = accountName;
    if (detailsEl) detailsEl.textContent = `${accountType} • Balance: ${formatCurrencyString(accountBalance)}`;

    // QR Code data represents a transfer URI
    const qrData = `myfin://deposit?acc_id=${accountId}&name=${encodeURIComponent(accountName)}&type=${encodeURIComponent(accountType)}`;
    if (imgEl) {
        imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;
    }

    if (btnSimulate) {
        btnSimulate.onclick = () => {
            hideAccountQRModal();
            simulateScanForAccount(accountId);
        };
    }

    modal.classList.remove('hidden');
}

function hideAccountQRModal() {
    const modal = document.getElementById('qr-code-modal');
    if (modal) modal.classList.add('hidden');
}

function simulateScanForAccount(accountId) {
    // Switch to Scan to Pay tab
    switchTab('scan-pay');

    // Pre-select the account option in the dropdown
    const select = document.getElementById('scan-merchant-select');
    if (select) {
        let found = false;
        for (let i = 0; i < select.options.length; i++) {
            const opt = select.options[i];
            if (opt.getAttribute('data-type') === 'account' && parseInt(opt.getAttribute('data-account-id')) === accountId) {
                select.selectedIndex = i;
                found = true;
                break;
            }
        }
        if (found) {
            updateScanPlaceholderAmount();
        }
    }

    // Trigger the scan flow
    triggerScanPaymentFlow();
}

// --- LIVE CAM & SIMULATOR OPTIONS ---
let activeScanSource = 'sim';
let webcamStream = null;
let qrScannerLoopActive = false;

async function setScanSource(sourceType) {
    activeScanSource = sourceType;

    const btnSim = document.getElementById('btn-toggle-sim');
    const btnCam = document.getElementById('btn-toggle-cam');
    const btnMyQR = document.getElementById('btn-toggle-myqr');
    const paymentDetailsGroup = document.getElementById('scanner-payment-details-group');
    const myqrInfoMessage = document.getElementById('myqr-info-message');
    const stageMyQR = document.getElementById('scanner-stage-myqr');
    const stageIdle = document.getElementById('scanner-stage-idle');

    // Reset helper active classes
    [btnSim, btnCam, btnMyQR].forEach(btn => {
        if (btn) {
            btn.className = 'btn-secondary';
            btn.style.background = 'var(--bg-white)';
            btn.style.color = 'var(--text-main)';
            btn.style.border = '1px solid var(--border)';
        }
    });

    // Hide stageMyQR by default
    if (stageMyQR) stageMyQR.classList.add('hidden');
    if (myqrInfoMessage) myqrInfoMessage.classList.add('hidden');
    if (paymentDetailsGroup) paymentDetailsGroup.classList.remove('hidden');

    if (sourceType === 'sim') {
        if (btnSim) {
            btnSim.className = 'btn-primary';
            btnSim.style.background = 'var(--primary)';
            btnSim.style.color = '#ffffff';
            btnSim.style.border = 'none';
        }
        stopWebcamStream();
        if (stageIdle) stageIdle.classList.remove('hidden');
    } else if (sourceType === 'cam') {
        if (btnCam) {
            btnCam.className = 'btn-primary';
            btnCam.style.background = 'var(--primary)';
            btnCam.style.color = '#ffffff';
            btnCam.style.border = 'none';
        }
        await startWebcamStream();
    } else if (sourceType === 'myqr') {
        if (btnMyQR) {
            btnMyQR.className = 'btn-primary';
            btnMyQR.style.background = 'var(--primary)';
            btnMyQR.style.color = '#ffffff';
            btnMyQR.style.border = 'none';
        }
        stopWebcamStream();
        if (stageIdle) stageIdle.classList.add('hidden');
        if (stageMyQR) stageMyQR.classList.remove('hidden');
        if (myqrInfoMessage) myqrInfoMessage.classList.remove('hidden');
        if (paymentDetailsGroup) paymentDetailsGroup.classList.add('hidden');

        // Populate the accounts dropdown in Show My QR stage and draw the QR
        populateMyQRDropdown();
    }
}

function populateMyQRDropdown() {
    const select = document.getElementById('myqr-account-select');
    if (!select) return;

    select.innerHTML = '';
    bankAccountsDatabase.forEach(acc => {
        select.innerHTML += `<option value="${acc.id}" data-name="${acc.name}" data-type="${acc.type}" data-balance="${acc.balance}">${acc.name}</option>`;
    });

    updateMyQRDisplay();
}

function updateMyQRDisplay() {
    const select = document.getElementById('myqr-account-select');
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption) {
        // If there are no accounts registered yet
        const imgEl = document.getElementById('myqr-display-image');
        if (imgEl) imgEl.src = '';
        const balLabel = document.getElementById('myqr-account-balance-label');
        if (balLabel) balLabel.textContent = 'No bank accounts available.';
        return;
    }

    const accountId = selectedOption.value;
    const accountName = selectedOption.getAttribute('data-name');
    const accountType = selectedOption.getAttribute('data-type');
    const accountBalance = parseFloat(selectedOption.getAttribute('data-balance'));

    const imgEl = document.getElementById('myqr-display-image');
    const balLabel = document.getElementById('myqr-account-balance-label');

    const qrData = `myfin://deposit?acc_id=${accountId}&name=${encodeURIComponent(accountName)}&type=${encodeURIComponent(accountType)}`;
    if (imgEl) {
        imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}`;
    }
    if (balLabel) {
        balLabel.textContent = `Balance: ${formatCurrencyString(accountBalance)}`;
    }
}


async function startWebcamStream() {
    const video = document.getElementById('scanner-webcam-video');
    if (!video) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        webcamStream = stream;
        video.srcObject = stream;
        video.classList.remove('hidden');
        const idleEl = document.getElementById('scanner-stage-idle');
        if (idleEl) idleEl.classList.add('hidden');

        // Start scanning frames for real QR decoding
        startQRScannerLoop();
    } catch (err) {
        console.error('Webcam stream initiation failed:', err);
        alert('Webcam access was denied or unavailable. Reverting back to Simulator Mode.');
        setScanSource('sim');
    }
}

function stopWebcamStream() {
    stopQRScannerLoop();
    const video = document.getElementById('scanner-webcam-video');
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    if (video) {
        video.classList.add('hidden');
        video.srcObject = null;
    }
    const idleEl = document.getElementById('scanner-stage-idle');
    if (idleEl) idleEl.classList.remove('hidden');
}

// --- REAL QR CODE FRAME SCANNING LOOP (jsQR) ---
function startQRScannerLoop() {
    const video = document.getElementById('scanner-webcam-video');
    if (!video) return;

    qrScannerLoopActive = true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    function scanFrame() {
        if (!qrScannerLoopActive || video.paused || video.ended) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA && window.jsQR) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                console.log("Found QR code data:", code.data);
                handleDecodedQRCode(code.data);
                return; // Stop scanning after first decode
            }
        }
        requestAnimationFrame(scanFrame);
    }
    requestAnimationFrame(scanFrame);
}

function stopQRScannerLoop() {
    qrScannerLoopActive = false;
}

function handleDecodedQRCode(qrData) {
    stopQRScannerLoop();
    stopWebcamStream();

    const select = document.getElementById('scan-merchant-select');
    const customAmtEl = document.getElementById('scan-custom-amount');

    if (!select) return;

    try {
        if (qrData.startsWith('myfin://deposit')) {
            const url = new URL(qrData.replace('myfin://', 'http://'));
            const accId = url.searchParams.get('acc_id');
            const accName = url.searchParams.get('name');

            // Select this account in the dropdown
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                if (opt.getAttribute('data-type') === 'account' && opt.getAttribute('data-account-id') === accId) {
                    select.selectedIndex = i;
                    found = true;
                    break;
                }
            }

            if (!found) {
                alert("Scanned QR code corresponds to an account that is not registered.");
                setScanSource('sim');
                return;
            }

            if (customAmtEl) {
                customAmtEl.value = '50.00'; // Default deposit amount
            }

            alert(`Decoded Account QR: Deposit to "${accName}". Initiating transaction...`);
            triggerScanPaymentFlow();
        } else {
            // Check if it matches one of our merchants
            let found = false;
            for (let i = 0; i < select.options.length; i++) {
                const opt = select.options[i];
                if (opt.value.toLowerCase() === qrData.toLowerCase()) {
                    select.selectedIndex = i;
                    found = true;
                    break;
                }
            }

            if (found) {
                updateScanPlaceholderAmount();
                alert(`Decoded Merchant QR: ${qrData}. Initiating payment...`);
                triggerScanPaymentFlow();
            } else {
                alert(`Scanned unknown QR Code data: "${qrData}". Reverting to simulator.`);
                setScanSource('sim');
            }
        }
    } catch (e) {
        console.error("Failed to parse QR code", e);
        alert(`Failed to parse QR code data. Reverting to simulator.`);
        setScanSource('sim');
    }
}


// --- SCAN TO PAY SIMULATOR ---
function updateScanPlaceholderAmount() {
    const select = document.getElementById('scan-merchant-select');
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    const defaultAmt = selectedOption.getAttribute('data-amt');

    const amtInput = document.getElementById('scan-custom-amount');
    if (amtInput) amtInput.value = defaultAmt;
}

function triggerScanPaymentFlow() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        alert('Please log in first.');
        return;
    }

    const select = document.getElementById('scan-merchant-select');
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    const merchantName = selectedOption.value;
    const isOurAccount = selectedOption.getAttribute('data-type') === 'account';
    const accountId = selectedOption.getAttribute('data-account-id');
    const category = selectedOption.getAttribute('data-cat') || 'Others';

    const customAmtEl = document.getElementById('scan-custom-amount');
    let amount = customAmtEl ? parseFloat(customAmtEl.value) : 0;
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid payment amount.');
        return;
    }

    // Capture control elements to disable during scan
    const btn = document.getElementById('btn-start-scan');
    const toggleSim = document.getElementById('btn-toggle-sim');
    const toggleCam = document.getElementById('btn-toggle-cam');

    if (btn) btn.disabled = true;
    if (customAmtEl) customAmtEl.disabled = true;
    if (toggleSim) toggleSim.disabled = true;
    if (toggleCam) toggleCam.disabled = true;
    select.disabled = true;

    const box = document.getElementById('scanner-box');
    const stageIdle = document.getElementById('scanner-stage-idle');
    const stageScanning = document.getElementById('scanner-stage-scanning');
    const stageProcessing = document.getElementById('scanner-stage-processing');
    const stageSuccess = document.getElementById('scanner-stage-success');

    // 1. Enter Scanning Stage
    if (box) box.classList.add('scanning-active');
    if (stageIdle) stageIdle.classList.add('hidden');
    if (stageSuccess) stageSuccess.classList.add('hidden');
    if (stageScanning) stageScanning.classList.remove('hidden');

    // 2. Wait 2 seconds, transition to processing bank authentication
    setTimeout(() => {
        if (stageScanning) stageScanning.classList.add('hidden');
        if (stageProcessing) stageProcessing.classList.remove('hidden');

        // 3. Wait 1.5 seconds, process transactions insert API and transition to Success
        setTimeout(async () => {
            try {
                // If viewing in INR, divide the transaction back to USD base
                let usdAmount = amount;
                if (currentSystemCurrency === 'INR') {
                    usdAmount = usdAmount / EXCHANGE_RATE_MULTIPLIER;
                }

                const response = await fetch(`${API_BASE}/transactions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        desc: isOurAccount ? `Scan Deposit: ${merchantName}` : `Scan to Pay: ${merchantName}`,
                        amount: usdAmount,
                        type: isOurAccount ? 'income' : 'expense',
                        category: isOurAccount ? 'Others' : category,
                        method: 'Scan to Pay',
                        account_id: isOurAccount ? parseInt(accountId) : undefined
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to register scan payment');
                }

                // Stop the live webcam feed upon success
                stopWebcamStream();

                // Transition to success screen
                if (stageProcessing) stageProcessing.classList.add('hidden');
                if (stageSuccess) stageSuccess.classList.remove('hidden');

                const detailsEl = document.getElementById('scan-success-details');
                if (detailsEl) {
                    if (isOurAccount) {
                        detailsEl.textContent = `Deposited ${formatCurrencyString(usdAmount)} into ${merchantName}`;
                    } else {
                        detailsEl.textContent = `Transferred ${formatCurrencyString(usdAmount)} to ${merchantName}`;
                    }
                }

                // Fetch transactions database in background
                await fetchAndRenderTransactions();

                // 4. Wait 3 seconds, reset scanner back to Idle/Camera state
                setTimeout(async () => {
                    if (box) box.classList.remove('scanning-active');
                    if (stageSuccess) stageSuccess.classList.add('hidden');

                    if (btn) btn.disabled = false;
                    if (customAmtEl) customAmtEl.disabled = false;
                    if (toggleSim) toggleSim.disabled = false;
                    if (toggleCam) toggleCam.disabled = false;
                    select.disabled = false;


                    // If live camera is still active, restart it for another payment!
                    if (activeScanSource === 'cam') {
                        await startWebcamStream();
                    } else {
                        if (stageIdle) stageIdle.classList.remove('hidden');
                    }
                }, 3000);

            } catch (err) {
                alert('Scan to Pay Error: ' + err.message);
                stopWebcamStream();
                if (box) box.classList.remove('scanning-active');
                if (stageProcessing) stageProcessing.classList.add('hidden');
                if (stageIdle) stageIdle.classList.remove('hidden');

                if (btn) btn.disabled = false;
                if (customAmtEl) customAmtEl.disabled = false;
                if (toggleSim) toggleSim.disabled = false;
                if (toggleCam) toggleCam.disabled = false;
                select.disabled = false;
            }
        }, 1500);
    }, 2000);
}

// --- AI ADVISOR ENGINE ---
async function fetchAISuggestions() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/ai/suggestions`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch AI insights');
        }
        const data = await response.json();

        // Update summary values
        document.getElementById('ai-savings-value').textContent = formatCurrencyString(data.summary.balance);
        document.getElementById('ai-savings-rate').textContent = `Savings Rate: ${data.summary.savings_rate.toFixed(1)}%`;

        document.getElementById('ai-burn-value').textContent = formatCurrencyString(data.summary.expenses);
        document.getElementById('ai-burn-rate').textContent = `Burn Ratio: ${data.summary.burn_rate.toFixed(1)}%`;

        // Calculate dynamic financial health score
        let score = 75;
        if (data.summary.balance < 0) {
            score -= 25;
        } else if (data.summary.savings_rate > 20) {
            score += 15;
        } else {
            score += Math.round(data.summary.savings_rate - 10);
        }
        score = Math.max(10, Math.min(100, score));

        const healthEl = document.getElementById('ai-health-score');
        healthEl.textContent = score;

        // Dynamic colors for health circle border/text
        healthEl.className = 'health-score-value';
        if (score >= 80) {
            healthEl.classList.add('score-good');
        } else if (score >= 50) {
            healthEl.classList.add('score-medium');
        } else {
            healthEl.classList.add('score-poor');
        }

        // Render advisory cards
        const listContainer = document.getElementById('ai-suggestions-list');
        listContainer.innerHTML = '';

        if (data.suggestions.length === 0) {
            listContainer.innerHTML = `
                <div class="card text-center" style="border:1px dashed var(--border); padding:20px;">
                    <p style="color:var(--text-muted);">No financial suggestions generated yet. Add transactions to analyze spending.</p>
                </div>
            `;
            return;
        }

        data.suggestions.forEach(item => {
            const priorityBadgeColor = item.priority === 'high' ? 'bg-expense' : (item.priority === 'medium' ? 'bg-warning' : 'bg-income');
            const cardHTML = `
                <div class="ai-suggestion-card priority-${item.priority}">
                    <div class="suggestion-icon">
                        <i class="fa-solid ${item.icon || 'fa-circle-info'}"></i>
                    </div>
                    <div class="suggestion-content">
                        <div class="suggestion-meta">
                            <span class="suggestion-category">${item.category}</span>
                            <span class="badge ${priorityBadgeColor}" style="font-size:0.7rem; padding:3px 6px;">${item.priority.toUpperCase()}</span>
                        </div>
                        <h4 class="suggestion-title">${item.title}</h4>
                        <p class="suggestion-desc">${item.desc}</p>
                        ${item.action ? `
                            <div class="suggestion-action">
                                <strong>Action Plan:</strong> ${item.action}
                            </div>
                         ` : ''}
                    </div>
                </div>
            `;
            listContainer.innerHTML += cardHTML;
        });
    } catch (err) {
        console.error('AI Advisor error:', err);
    }
}

// --- QUICK ACCOUNT REGISTRATION MODAL CONTROLLERS ---
function showAccountFormModal() {
    document.getElementById('acc-form-modal').classList.remove('hidden');
}

// Ensure globally accessible
window.showAccountFormModal = showAccountFormModal;

function hideAccountFormModal() {
    document.getElementById('acc-form-modal').classList.add('hidden');
    document.getElementById('modal-acc-name').value = '';
    document.getElementById('modal-acc-balance').value = '';
}

window.hideAccountFormModal = hideAccountFormModal;

async function addNewBankAccountModal(event) {
    event.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const name = document.getElementById('modal-acc-name').value;
    const type = document.getElementById('modal-acc-type').value;
    let balance = parseFloat(document.getElementById('modal-acc-balance').value);

    if (isNaN(balance)) {
        alert('Please enter a valid starting balance.');
        return;
    }

    if (currentSystemCurrency === 'INR') {
        balance = balance / EXCHANGE_RATE_MULTIPLIER;
    }

    try {
        const response = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, type, balance })
        });

        if (!response.ok) {
            throw new Error('Failed to create account ledger');
        }

        hideAccountFormModal();
        await fetchAndRenderAccounts(activeViewFilter === 'accounts');
    } catch (err) {
        alert('Error creating account: ' + err.message);
    }
}

window.addNewBankAccountModal = addNewBankAccountModal;

// --- GOALS AND MILESTONES CONTROLLERS ---
let goalsDatabase = [];

async function fetchAndRenderGoals() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/goals`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch savings goals');
        }
        goalsDatabase = await response.json();

        if (!goalsDatabase || goalsDatabase.length === 0) {
            goalsDatabase = [
                { id: 201, name: "New Laptop", target_amount: 100000, current_amount: 65000, target_date: "Dec 2026", icon: "fa-laptop", badge: "badge-blue" },
                { id: 202, name: "Emergency Fund", target_amount: 100000, current_amount: 35000, target_date: "Jun 2027", icon: "fa-shield-halved", badge: "badge-amber" },
                { id: 203, name: "Trip to Himachal", target_amount: 50000, current_amount: 10000, target_date: "Apr 2027", icon: "fa-plane-departure", badge: "badge-coral" },
                { id: 204, name: "New Bike", target_amount: 150000, current_amount: 18000, target_date: "Dec 2027", icon: "fa-motorcycle", badge: "badge-pink" }
            ];
        }

        const grid = document.getElementById('goals-cards-grid');
        if (!grid) return;

        grid.innerHTML = '';

        const goalConfigIcons = [
            { icon: "fa-laptop", badge: "badge-blue" },
            { icon: "fa-shield-halved", badge: "badge-amber" },
            { icon: "fa-plane-departure", badge: "badge-coral" },
            { icon: "fa-motorcycle", badge: "badge-pink" }
        ];

        goalsDatabase.forEach((goal, idx) => {
            const pct = goal.target_amount > 0 ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) : 0;
            const cfg = goalConfigIcons[idx % goalConfigIcons.length];
            const iconClass = goal.icon || cfg.icon;
            const badgeClass = goal.badge || cfg.badge;

            const cardHTML = `
                <div class="goal-card-3d">
                    <div>
                        <div class="goal-card-header">
                            <div class="icon-badge-3d ${badgeClass}" style="width: 40px; height: 40px; font-size: 1rem;">
                                <i class="fa-solid ${iconClass}"></i>
                            </div>
                            <div style="flex: 1;">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <h4 class="goal-card-title">${goal.name}</h4>
                                    <button onclick="deleteGoal(${goal.id})" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.82rem; padding: 2px; opacity: 0.7;" title="Delete Goal">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                                ${goal.target_date ? `<small style="color: var(--text-muted); font-size: 0.75rem; font-weight: 600;">Target: ${goal.target_date}</small>` : ''}
                            </div>
                        </div>

                        <div class="goal-card-amounts">
                            <span style="font-weight: 800; color: var(--text-main); font-size: 0.95rem;">${formatCurrencyString(goal.current_amount)}</span>
                            <span style="color: var(--text-muted); font-size: 0.8rem;">Target ${formatCurrencyString(goal.target_amount)}</span>
                        </div>

                        <div style="height: 12px; background: rgba(226, 232, 240, 0.7); border-radius: var(--radius-pill); overflow: hidden; margin-bottom: 6px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.06);">
                            <div style="width: ${pct}%; height: 100%; border-radius: var(--radius-pill); background: linear-gradient(90deg, #3b82f6 0%, #2563eb 100%); transition: width 0.6s ease;"></div>
                        </div>
                        <div style="text-align: right; font-size: 0.82rem; font-weight: 800; color: var(--primary); margin-bottom: 14px;">
                            ${pct}%
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="number" id="add-funds-input-${goal.id}" placeholder="Amount" step="0.01" style="flex: 1; padding: 7px 12px; border-radius: var(--radius-pill); border: 1.5px solid var(--glass-border); font-size: 0.82rem; background: var(--glass-bg); color: var(--text-main); outline: none;">
                        <button onclick="addFundsToGoal(${goal.id}, ${goal.current_amount}, ${goal.target_amount})" class="btn-primary" style="padding: 7px 14px; font-size: 0.82rem; border-radius: var(--radius-pill); white-space: nowrap; font-weight: 700;">
                            <i class="fa-solid fa-plus"></i> Add
                        </button>
                    </div>
                </div>
            `;
            grid.innerHTML += cardHTML;
        });
    } catch (err) {
        console.error('Error fetching goals:', err);
    }
}

function showGoalFormModal() {
    const modal = document.getElementById('goal-form-modal');
    if (modal) modal.classList.remove('hidden');
}

function hideGoalFormModal() {
    const modal = document.getElementById('goal-form-modal');
    if (modal) modal.classList.add('hidden');
    const nameIn = document.getElementById('goal-name-input');
    const targetIn = document.getElementById('goal-target-input');
    const currentIn = document.getElementById('goal-current-input');
    const dateIn = document.getElementById('goal-date-input');
    if (nameIn) nameIn.value = '';
    if (targetIn) targetIn.value = '';
    if (currentIn) currentIn.value = '0.00';
    if (dateIn) dateIn.value = '';
}

window.showGoalFormModal = showGoalFormModal;
window.hideGoalFormModal = hideGoalFormModal;
window.fetchAndRenderGoals = fetchAndRenderGoals;

async function addNewGoal(event) {
    event.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const name = document.getElementById('goal-name-input').value;
    let target_amount = parseFloat(document.getElementById('goal-target-input').value);
    let current_amount = parseFloat(document.getElementById('goal-current-input').value) || 0.0;
    const target_date = document.getElementById('goal-date-input').value || null;

    if (isNaN(target_amount) || target_amount <= 0) {
        alert('Please enter a valid target amount.');
        return;
    }

    if (currentSystemCurrency === 'INR') {
        target_amount = target_amount / EXCHANGE_RATE_MULTIPLIER;
        current_amount = current_amount / EXCHANGE_RATE_MULTIPLIER;
    }

    try {
        const response = await fetch(`${API_BASE}/goals`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name, target_amount, current_amount, target_date })
        });

        if (!response.ok) {
            throw new Error('Failed to create goal');
        }

        document.getElementById('goal-name-input').value = '';
        document.getElementById('goal-target-input').value = '';
        document.getElementById('goal-current-input').value = '0.00';
        document.getElementById('goal-date-input').value = '';

        await fetchAndRenderGoals();
    } catch (err) {
        alert('Error creating goal: ' + err.message);
    }
}

window.addNewGoal = addNewGoal;

async function addFundsToGoal(goalId, currentAmount, targetAmount) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const amountInput = document.getElementById(`add-funds-input-${goalId}`);
    let addedFunds = parseFloat(amountInput.value);

    if (isNaN(addedFunds) || addedFunds <= 0) {
        alert('Please enter a valid amount to save.');
        return;
    }

    if (currentSystemCurrency === 'INR') {
        addedFunds = addedFunds / EXCHANGE_RATE_MULTIPLIER;
    }

    const newAmount = currentAmount + addedFunds;

    try {
        const response = await fetch(`${API_BASE}/goals/${goalId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ current_amount: newAmount })
        });

        if (!response.ok) {
            throw new Error('Failed to update goal amount');
        }

        amountInput.value = '';
        await fetchAndRenderGoals();
    } catch (err) {
        alert('Error saving funds: ' + err.message);
    }
}

window.addFundsToGoal = addFundsToGoal;

async function deleteGoal(goalId) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    if (!confirm('Are you sure you want to delete this savings goal?')) return;

    try {
        const response = await fetch(`${API_BASE}/goals/${goalId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to delete goal');
        }

        await fetchAndRenderGoals();
    } catch (err) {
        alert('Error deleting goal: ' + err.message);
    }
}

window.deleteGoal = deleteGoal;
window.handleTxCategoryChange = handleTxCategoryChange;
window.renderReportsView = renderReportsView;

async function loadUserProfileDetails() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch user profile');
        }
        const data = await response.json();
        const user = data.user;

        localStorage.setItem('user_name', user.name);
        localStorage.setItem('user_email', user.email);
        localStorage.setItem('user_phone', user.phone_number || '');
        localStorage.setItem('user_avatar', user.avatar || '');
        localStorage.setItem('user_address', user.address || '');

        if (user.budget_limit !== undefined && user.budget_limit !== null) {
            systemBudgetLimit = parseFloat(user.budget_limit);
        }
        updateBudgetLimitInputDisplay();

        const nameEl = document.getElementById('settings-profile-name');
        const emailEl = document.getElementById('settings-profile-email');
        const phoneEl = document.getElementById('settings-profile-phone');
        const photoEl = document.getElementById('settings-profile-photo-url');
        const addressEl = document.getElementById('settings-profile-address');
        const passEl = document.getElementById('settings-profile-password');

        if (nameEl) nameEl.value = user.name;
        if (emailEl) emailEl.value = user.email;
        if (phoneEl) phoneEl.value = user.phone_number || '';
        if (photoEl) photoEl.value = user.avatar || '';
        if (addressEl) addressEl.value = user.address || '';
        if (passEl) passEl.value = '';

        const displayNameEl = document.getElementById('profile-display-name');
        const displayEmailEl = document.getElementById('profile-display-email');
        if (displayNameEl) displayNameEl.textContent = user.name;
        if (displayEmailEl) displayEmailEl.textContent = user.email;

        // Generate dynamic mock Web3 Vault Node ID and last login timestamp
        const nodeIdEl = document.getElementById('settings-vault-node-id');
        const lastLoginEl = document.getElementById('settings-vault-last-login');
        if (nodeIdEl) {
            let hashVal = 0;
            const emailStr = user.email || 'user';
            for (let i = 0; i < emailStr.length; i++) {
                hashVal = (hashVal << 5) - hashVal + emailStr.charCodeAt(i);
                hashVal |= 0;
            }
            const hex = Math.abs(hashVal).toString(16).toUpperCase().padStart(8, '0');
            nodeIdEl.textContent = `0x${hex}E${user.id || 1}`;
        }
        if (lastLoginEl) {
            const today = new Date();
            const formatStr = today.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
            lastLoginEl.textContent = formatStr;
        }

        previewSettingsAvatar();
    } catch (err) {
        console.error('Error loading settings profile:', err);
    }
}

function previewSettingsAvatar() {
    const avatarDiv = document.getElementById('settings-profile-avatar');
    const photoUrlInputEl = document.getElementById('settings-profile-photo-url');
    const nameInputEl = document.getElementById('settings-profile-name');

    const photoUrlInput = photoUrlInputEl ? photoUrlInputEl.value.trim() : '';
    const nameInput = (nameInputEl && nameInputEl.value) ? nameInputEl.value : (localStorage.getItem('user_name') || 'U');
    const sidebarAvatar = document.getElementById('profile-avatar');

    if (photoUrlInput) {
        if (avatarDiv) {
            avatarDiv.style.backgroundImage = `url('${photoUrlInput}')`;
            avatarDiv.textContent = '';
        }
        if (sidebarAvatar) {
            sidebarAvatar.style.backgroundImage = `url('${photoUrlInput}')`;
            sidebarAvatar.style.backgroundSize = 'cover';
            sidebarAvatar.style.backgroundPosition = 'center';
            sidebarAvatar.textContent = '';
        }
    } else {
        if (avatarDiv) {
            avatarDiv.style.backgroundImage = 'none';
            avatarDiv.textContent = nameInput.charAt(0).toUpperCase();
        }
        if (sidebarAvatar) {
            sidebarAvatar.style.backgroundImage = 'none';
            sidebarAvatar.textContent = nameInput.charAt(0).toUpperCase();
        }
    }
}

async function updateUserProfile(event) {
    event.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const nameVal = document.getElementById('settings-profile-name').value;
    const emailVal = document.getElementById('settings-profile-email').value;
    const phoneVal = document.getElementById('settings-profile-phone').value;
    const avatarVal = document.getElementById('settings-profile-photo-url').value;
    const addressVal = document.getElementById('settings-profile-address').value;
    const passVal = document.getElementById('settings-profile-password').value;

    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: nameVal,
                email: emailVal,
                phone_number: phoneVal,
                avatar: avatarVal,
                address: addressVal,
                password: passVal || null
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update profile');
        }

        alert('Profile updated successfully!');
        await loadUserProfileDetails();
    } catch (err) {
        alert('Profile Update Error: ' + err.message);
    }
}

function promptPhotoUrl() {
    const photoEl = document.getElementById('settings-profile-photo-url');
    const current = photoEl ? photoEl.value : '';
    const newUrl = prompt('Enter image URL for profile photo:', current);
    if (newUrl !== null) {
        if (photoEl) photoEl.value = newUrl.trim();
        previewSettingsAvatar();
    }
}

function updateBudgetLimitInputDisplay() {
    const symbolEl = document.getElementById('settings-budget-currency-symbol');
    const inputEl = document.getElementById('settings-budget-limit-input');
    if (symbolEl) {
        symbolEl.textContent = currentSystemCurrency === 'INR' ? '₹' : '$';
    }
    if (inputEl) {
        let displayVal = systemBudgetLimit;
        if (currentSystemCurrency === 'INR') {
            displayVal = systemBudgetLimit * EXCHANGE_RATE_MULTIPLIER;
        }
        inputEl.value = displayVal.toFixed(2);
    }
}

async function updateSystemPreferences(event) {
    if (event) event.preventDefault();
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const currencySelect = document.getElementById('currency-toggle-select');
    const budgetInput = document.getElementById('settings-budget-limit-input');

    if (currencySelect) {
        currentSystemCurrency = currencySelect.value;
        localStorage.setItem('system_currency', currentSystemCurrency);
    }

    let budgetLimitUSD = 2000.00;
    if (budgetInput) {
        const inputVal = parseFloat(budgetInput.value);
        if (!isNaN(inputVal) && inputVal >= 0) {
            if (currentSystemCurrency === 'INR') {
                budgetLimitUSD = inputVal / EXCHANGE_RATE_MULTIPLIER;
            } else {
                budgetLimitUSD = inputVal;
            }
        } else {
            alert('Please enter a valid positive number for the budget limit.');
            return;
        }
    }

    const nameVal = localStorage.getItem('user_name') || '';
    const emailVal = localStorage.getItem('user_email') || '';
    const phoneVal = localStorage.getItem('user_phone') || '';
    const avatarVal = localStorage.getItem('user_avatar') || '';
    const addressVal = localStorage.getItem('user_address') || '';

    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: nameVal,
                email: emailVal,
                phone_number: phoneVal,
                avatar: avatarVal,
                address: addressVal,
                budget_limit: budgetLimitUSD
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to update system preferences');
        }

        systemBudgetLimit = budgetLimitUSD;
        alert('System preferences updated successfully!');
        
        updateBudgetLimitInputDisplay();
        renderApplicationData();
    } catch (err) {
        alert('Preferences Update Error: ' + err.message);
    }
}

window.loadUserProfileDetails = loadUserProfileDetails;
window.previewSettingsAvatar = previewSettingsAvatar;
window.updateUserProfile = updateUserProfile;
window.updateBudgetLimitInputDisplay = updateBudgetLimitInputDisplay;
window.updateSystemPreferences = updateSystemPreferences;

async function handleChatSubmit(event) {
    if (event) event.preventDefault();

    const inputEl = document.getElementById('ai-chat-input');
    if (!inputEl) return;

    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    await sendChatMessageToServer(text);
}

async function sendQuickChatMessage(text) {
    await sendChatMessageToServer(text);
}

async function sendChatMessageToServer(text) {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    appendChatMessage('user', text);

    const thinkingId = 'bot-thinking-' + Date.now();
    const chatContainer = document.getElementById('ai-chat-messages');
    if (chatContainer) {
        const thinkingHTML = `
            <div id="${thinkingId}" style="display: flex; gap: 10px; max-width: 80%;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; min-width: 32px; height: 32px;">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <div style="background: var(--bg-card); padding: 12px 16px; border-radius: 0 16px 16px 16px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">AI is analyzing your balance matrix...</span>
                    <i class="fa-solid fa-circle-notch fa-spin text-primary" style="font-size: 0.85rem;"></i>
                </div>
            </div>
        `;
        chatContainer.innerHTML += thinkingHTML;
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    try {
        const response = await fetch(`${API_BASE}/ai/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: text })
        });

        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) thinkingBubble.remove();

        if (!response.ok) {
            throw new Error('Failed to communicate with AI Chatbot');
        }

        const data = await response.json();
        appendChatMessage('bot', data.reply);
    } catch (err) {
        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) thinkingBubble.remove();
        appendChatMessage('bot', '⚠️ Sorry, I encountered an error checking your finance matrix: ' + err.message);
    }
}

function appendChatMessage(sender, text) {
    const chatContainer = document.getElementById('ai-chat-messages');
    if (!chatContainer) return;

    let bubbleHTML = '';
    if (sender === 'user') {
        const initial = localStorage.getItem('user_name') ? localStorage.getItem('user_name').charAt(0).toUpperCase() : 'U';
        bubbleHTML = `
            <div style="display: flex; gap: 10px; max-width: 80%; align-self: flex-end; flex-direction: row-reverse;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg-white); border: 1px solid var(--border); color: var(--text-main); display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: bold; min-width: 32px; height: 32px;">
                    ${initial}
                </div>
                <div style="background: var(--primary); color: white; padding: 12px 16px; border-radius: 16px 0 16px 16px; box-shadow: var(--shadow-sm); font-size: 0.85rem; line-height: 1.5; text-align: left;">
                    ${text}
                </div>
            </div>
        `;
    } else {
        const formattedText = text.replace(/\n/g, '<br>');
        bubbleHTML = `
            <div style="display: flex; gap: 10px; max-width: 80%;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.95rem; min-width: 32px; height: 32px;">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <div style="background: var(--bg-card); padding: 12px 16px; border-radius: 0 16px 16px 16px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); font-size: 0.85rem; line-height: 1.5; color: var(--text-main); text-align: left;">
                    ${formattedText}
                </div>
            </div>
        `;
    }

    chatContainer.innerHTML += bubbleHTML;
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function deleteEntireAccount() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    const confirm1 = confirm("🚨 WARNING: Are you sure you want to permanently delete your entire account? This will erase all of your data, bank accounts, transactions, and goals, and cannot be undone!");
    if (!confirm1) return;

    const confirm2 = confirm("Confirm final deletion. Clicking OK will permanently delete your account from the database.");
    if (!confirm2) return;

    try {
        const response = await fetch(`${API_BASE}/auth/profile`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete account');
        }

        alert('Your account and all associated data have been permanently deleted.');
        handleLogout();
    } catch (err) {
        alert('Error deleting account: ' + err.message);
    }
}

window.deleteEntireAccount = deleteEntireAccount;
window.handleChatSubmit = handleChatSubmit;
window.sendQuickChatMessage = sendQuickChatMessage;

function changeThemeAccent(color, name) {
    document.documentElement.style.setProperty('--primary', color);
    localStorage.setItem('theme_accent_color', color);
    localStorage.setItem('theme_accent_name', name);

    const buttons = ['indigo', 'emerald', 'violet', 'amber', 'pink'];
    buttons.forEach(btn => {
        const el = document.getElementById('theme-accent-' + btn);
        if (el) {
            el.style.borderColor = btn === name ? 'white' : 'transparent';
        }
    });
}

window.changeThemeAccent = changeThemeAccent;

function saveCategoryBudgets(event) {
    if (event) event.preventDefault();
    
    const inputs = document.querySelectorAll('.category-budget-input');
    const budgets = {};
    
    inputs.forEach(input => {
        const cat = input.getAttribute('data-category');
        let val = parseFloat(input.value);
        if (isNaN(val) || val < 0) {
            const defaults = {
                'Food & Dining': 500,
                'Transport': 200,
                'Shopping': 300,
                'Entertainment': 250,
                'Utilities': 400,
                'Others': 250
            };
            val = defaults[cat] || 0;
        } else {
            if (currentSystemCurrency === 'INR') {
                val = val / EXCHANGE_RATE_MULTIPLIER;
            }
        }
        budgets[cat] = val;
    });
    
    const email = localStorage.getItem('user_email') || 'default';
    localStorage.setItem(`category_budgets_${email}`, JSON.stringify(budgets));
    
    alert('Category budgets saved successfully!');
    renderReportsView();
}

window.saveCategoryBudgets = saveCategoryBudgets;

window.toggleAuthMode = toggleAuthMode;
window.handleLoginSubmit = handleLoginSubmit;
window.handleSignupSubmit = handleSignupSubmit;
window.switchTab = switchTab;
window.handleLogout = handleLogout;
window.showWelcomeOnboardingModal = showWelcomeOnboardingModal;
window.hideWelcomeOnboardingModal = hideWelcomeOnboardingModal;
window.showTransactionForm = showTransactionForm;
window.hideTransactionForm = hideTransactionForm;
window.addNewTransaction = addNewTransaction;
window.setOnboardingSlide = setOnboardingSlide;
window.changeOnboardingSlide = changeOnboardingSlide;
window.showAccountBalancesBreakdown = showAccountBalancesBreakdown;
window.hideAccountBalancesBreakdown = hideAccountBalancesBreakdown;
window.resetTxFilters = resetTxFilters;
window.toggleTxSort = toggleTxSort;
window.setScanSource = setScanSource;
window.triggerScanPaymentFlow = triggerScanPaymentFlow;
window.hideTransactionDetails = hideTransactionDetails;
window.showTransactionDetails = showTransactionDetails;
window.removeTransactionRecord = removeTransactionRecord;
window.addNewBankAccount = addNewBankAccount;
window.executeInternalTransfer = executeInternalTransfer;
window.showAccountQRModal = showAccountQRModal;
window.hideAccountQRModal = hideAccountQRModal;
window.removeBankAccount = removeBankAccount;
window.toggleDarkTheme = toggleDarkTheme;
window.handleTxSearchAndFilter = handleTxSearchAndFilter;
window.updateMyQRDisplay = updateMyQRDisplay;
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

function closeSidebarOnMobile() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) {
        sidebar.classList.remove('open');
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function sendAiPrompt(promptText) {
    const input = document.getElementById('ai-user-query-input');
    if (input) {
        input.value = promptText;
    }
    submitAiAdvisorMessage();
}

async function submitAiAdvisorMessage() {
    const input = document.getElementById('ai-user-query-input');
    const sendBtn = document.querySelector('.ai-chat-send-btn');
    if (!input) return;

    const message = input.value.trim();
    // 1. Handle empty input safely
    if (!message) {
        input.focus();
        return;
    }

    const historyBox = document.getElementById('ai-chat-history-box');
    if (!historyBox) return;

    // 2. Set loading state: disable input & send button
    input.value = '';
    input.disabled = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
    }

    // Append User Message Bubble
    const escapedMsg = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const userInitial = (localStorage.getItem('user_name') || 'N').charAt(0).toUpperCase();
    const userMsgHTML = `
        <div class="ai-message-bubble-row user-bubble-row" style="justify-content: flex-end; margin-left: auto;">
            <div class="ai-message-speech-bubble" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border-radius: 18px 4px 18px 18px; border: none; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);">
                <p style="margin: 0; font-weight: 500;">${escapedMsg}</p>
            </div>
            <div class="avatar-3d" style="width: 38px; height: 38px; font-size: 0.95rem; flex-shrink: 0;">${userInitial}</div>
        </div>
    `;
    historyBox.innerHTML += userMsgHTML;

    // Append Loading Indicator Bubble
    const thinkingId = `ai-thinking-${Date.now()}`;
    const thinkingHTML = `
        <div class="ai-message-bubble-row" id="${thinkingId}">
            <div class="ai-avatar-small-3d"><i class="fa-solid fa-brain"></i></div>
            <div class="ai-message-speech-bubble" style="color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-circle-notch fa-spin" style="color: var(--primary);"></i>
                <span>Analyzing your financial data...</span>
            </div>
        </div>
    `;
    historyBox.innerHTML += thinkingHTML;
    historyBox.scrollTop = historyBox.scrollHeight;

    const token = localStorage.getItem('auth_token');

    // Handle unauthenticated user gracefully
    if (!token) {
        const thinkingEl = document.getElementById(thinkingId);
        if (thinkingEl) thinkingEl.remove();

        historyBox.innerHTML += `
            <div class="ai-message-bubble-row">
                <div class="ai-avatar-small-3d"><i class="fa-solid fa-brain"></i></div>
                <div class="ai-message-speech-bubble" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3);">
                    <p style="margin: 0;">⚠️ Please log in to your account to get personalized financial advice.</p>
                </div>
            </div>
        `;
        historyBox.scrollTop = historyBox.scrollHeight;
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
        }
        input.focus();
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/ai/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: message })
        });

        const thinkingEl = document.getElementById(thinkingId);
        if (thinkingEl) thinkingEl.remove();

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server responded with status ${response.status}`);
        }

        const data = await response.json();
        const rawReply = data.reply || "I couldn't process that query. Please try asking about your savings, budget, or accounts.";

        // Format markdown boldly and line breaks safely
        const formattedReply = rawReply
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

        const botMsgHTML = `
            <div class="ai-message-bubble-row">
                <div class="ai-avatar-small-3d"><i class="fa-solid fa-brain"></i></div>
                <div class="ai-message-speech-bubble">
                    <p style="margin: 0; line-height: 1.6;">${formattedReply}</p>
                </div>
            </div>
        `;
        historyBox.innerHTML += botMsgHTML;
    } catch (err) {
        const thinkingEl = document.getElementById(thinkingId);
        if (thinkingEl) thinkingEl.remove();

        console.error('AI Advisor error:', err);
        const errHTML = `
            <div class="ai-message-bubble-row">
                <div class="ai-avatar-small-3d" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div class="ai-message-speech-bubble" style="border-color: rgba(239, 68, 68, 0.4); color: var(--danger);">
                    <p style="margin: 0;">⚠️ Error communicating with AI Advisor: ${err.message}. Please try again.</p>
                </div>
            </div>
        `;
        historyBox.innerHTML += errHTML;
    } finally {
        // Reset loading state
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
        }
        input.focus();
        historyBox.scrollTop = historyBox.scrollHeight;
    }
}

function setScanUIMode(mode) {
    activeScanSource = mode;
    const btnScan = document.getElementById('btn-scan-mode-scan');
    const btnMyQR = document.getElementById('btn-scan-mode-myqr');
    const scanViewfinder = document.getElementById('scan-ui-viewfinder-container');
    const myQrView = document.getElementById('scan-ui-myqr-container');

    if (mode === 'scan') {
        if (btnScan) btnScan.classList.add('active');
        if (btnMyQR) btnMyQR.classList.remove('active');
        if (scanViewfinder) scanViewfinder.classList.remove('hidden');
        if (myQrView) myQrView.classList.add('hidden');
    } else {
        if (btnScan) btnScan.classList.remove('active');
        if (btnMyQR) btnMyQR.classList.add('active');
        if (scanViewfinder) scanViewfinder.classList.add('hidden');
        if (myQrView) myQrView.classList.remove('hidden');
        populateMyQRDropdown();
    }
}

function renderScanRecentPayments() {
    const container = document.getElementById('scan-recent-payments-list');
    if (!container) return;

    const defaultPayments = [
        { name: "Cafe Coffee Day", cat: "Food & Dining", date: "Oct 09, 2026", amt: 250, icon: "fa-mug-hot", badge: "badge-coral" },
        { name: "Blinkit", cat: "Quick Commerce", date: "Oct 08, 2026", amt: 540, icon: "fa-bag-shopping", badge: "badge-amber" },
        { name: "PhonePe Transfer", cat: "Transfer", date: "Oct 06, 2026", amt: 1000, icon: "fa-money-bill-transfer", badge: "badge-purple" },
        { name: "Swiggy", cat: "Food & Dining", date: "Oct 04, 2026", amt: 310, icon: "fa-utensils", badge: "badge-coral" }
    ];

    container.innerHTML = defaultPayments.map(p => `
        <div class="recent-payment-item">
            <div class="recent-payment-left">
                <div class="icon-badge-3d ${p.badge}" style="width: 38px; height: 38px; font-size: 0.95rem;">
                    <i class="fa-solid ${p.icon}"></i>
                </div>
                <div>
                    <h4 class="recent-payment-title">${p.name}</h4>
                    <p class="recent-payment-sub">${p.date} • ${p.cat}</p>
                </div>
            </div>
            <span class="recent-payment-amount">-₹${p.amt.toLocaleString('en-IN')}</span>
        </div>
    `).join('');
}

async function refreshDatabaseStatus() {
    const refreshIcon = document.getElementById('supabase-refresh-icon');
    const statusPill = document.getElementById('supabase-header-pill');
    const pillText = document.getElementById('supabase-pill-text');
    const metaStatus = document.getElementById('db-meta-status');
    const metaEngine = document.getElementById('db-meta-engine');
    const metaProject = document.getElementById('db-meta-project');
    const metaHost = document.getElementById('db-meta-host');
    const metaRecords = document.getElementById('db-meta-records');

    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    // 1. Show Checking State
    if (pillText) {
        pillText.innerHTML = '<span class="pulse-dot-yellow" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#f59e0b;margin-right:5px;"></span> Checking...';
    }
    if (metaStatus) {
        metaStatus.innerHTML = '<span class="pulse-dot-yellow" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:6px;"></span> Checking Connection...';
        metaStatus.style.color = '#f59e0b';
    }

    try {
        const fetchFn = (typeof originalFetch === 'function') ? originalFetch : window.fetch;
        const response = await fetchFn(`${API_BASE}/db-status`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data && data.connected) {
            // 2. Connected State
            if (statusPill) statusPill.style.display = 'inline-flex';
            if (pillText) pillText.textContent = `Supabase: ${data.project_id || 'pybsbrbytfbfdkdwhrda'}`;
            if (metaStatus) {
                metaStatus.innerHTML = '<span class="pulse-dot-green"></span> Connected & Synced';
                metaStatus.style.color = '#10b981';
            }
            if (metaEngine) metaEngine.textContent = data.engine || 'Supabase PostgreSQL';
            if (metaProject) metaProject.textContent = data.project_id || 'pybsbrbytfbfdkdwhrda';
            if (metaHost) {
                try {
                    metaHost.textContent = data.supabase_url ? new URL(data.supabase_url).hostname : 'db.pybsbrbytfbfdkdwhrda.supabase.co';
                } catch (e) {
                    metaHost.textContent = 'db.pybsbrbytfbfdkdwhrda.supabase.co';
                }
            }
            if (metaRecords && data.stats) {
                const total = (data.stats.users || 0) + (data.stats.transactions || 0) + (data.stats.bank_accounts || 0) + (data.stats.goals || 0);
                metaRecords.textContent = `${total} Cloud Records (${data.stats.transactions || 0} Tx)`;
            }
        } else {
            // 3. Disconnected State from API response
            const errMsg = data?.error || 'Database unavailable';
            if (pillText) {
                pillText.innerHTML = '<span class="pulse-dot-red" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:5px;"></span> Supabase: Disconnected';
            }
            if (metaStatus) {
                metaStatus.innerHTML = '<span class="pulse-dot-red" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px;"></span> Disconnected';
                metaStatus.style.color = '#ef4444';
            }
            if (metaRecords) metaRecords.textContent = `Error: ${errMsg}`;
        }
    } catch (err) {
        // 4. Disconnected / Network Error State
        console.warn('Database status check encountered network error:', err.message);
        if (pillText) {
            pillText.innerHTML = '<span class="pulse-dot-red" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:5px;"></span> Supabase: Offline';
        }
        if (metaStatus) {
            metaStatus.innerHTML = '<span class="pulse-dot-red" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px;"></span> Offline / Disconnected';
            metaStatus.style.color = '#ef4444';
        }
        if (metaRecords) metaRecords.textContent = 'Offline (Check backend service)';
    } finally {
        if (refreshIcon) {
            setTimeout(() => refreshIcon.classList.remove('fa-spin'), 500);
        }
    }
}

// Global Window Exports
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.closeSidebarOnMobile = closeSidebarOnMobile;
window.refreshDatabaseStatus = refreshDatabaseStatus;
window.toggleDarkTheme = toggleDarkTheme;
window.showWelcomeOnboardingModal = showWelcomeOnboardingModal;
window.hideWelcomeOnboardingModal = hideWelcomeOnboardingModal;
window.setOnboardingSlide = setOnboardingSlide;
window.changeOnboardingSlide = changeOnboardingSlide;
window.showTransactionForm = showTransactionForm;
window.hideTransactionForm = hideTransactionForm;
window.showAccountFormModal = showAccountFormModal;
window.hideAccountFormModal = hideAccountFormModal;
window.showGoalFormModal = showGoalFormModal;
window.hideGoalFormModal = hideGoalFormModal;
window.addNewGoal = addNewGoal;
window.addFundsToGoal = addFundsToGoal;
window.deleteGoal = deleteGoal;
window.sendAiPrompt = sendAiPrompt;
window.submitAiAdvisorMessage = submitAiAdvisorMessage;
window.setScanUIMode = setScanUIMode;
window.renderScanRecentPayments = renderScanRecentPayments;
window.switchReportsSubTab = switchReportsSubTab;
window.switchSettingsSubTab = switchSettingsSubTab;
window.handleTxSearchAndFilter = handleTxSearchAndFilter;
window.toggleTxSort = toggleTxSort;
window.showAccountBalancesBreakdown = showAccountBalancesBreakdown;
window.hideAccountBalancesBreakdown = hideAccountBalancesBreakdown;
window.showAccountQRModal = showAccountQRModal;
window.hideAccountQRModal = hideAccountQRModal;
window.updateMyQRDisplay = updateMyQRDisplay;
window.triggerScanPaymentFlow = triggerScanPaymentFlow;
window.promptPhotoUrl = promptPhotoUrl;

// Initial DB check and recent payments on startup
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(refreshDatabaseStatus, 500);
    renderScanRecentPayments();
});

