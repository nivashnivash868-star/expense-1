-- =========================================================
-- Supabase Database Schema for Finance Tracker / Expense App
-- Project: pybsbrbytfbfdkdwhrda
-- =========================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone_number TEXT,
    avatar TEXT,
    address TEXT,
    budget_limit DOUBLE PRECISION DEFAULT 2000.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Bank Accounts Table
CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance DOUBLE PRECISION NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS public.transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    "desc" TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    method TEXT DEFAULT 'Bank',
    account_id INTEGER REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Goals Table
CREATE TABLE IF NOT EXISTS public.goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount DOUBLE PRECISION NOT NULL,
    current_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    target_date TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON public.bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Ensure Sequences match max ID
SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE((SELECT MAX(id) FROM public.users), 1));
SELECT setval(pg_get_serial_sequence('public.bank_accounts', 'id'), COALESCE((SELECT MAX(id) FROM public.bank_accounts), 1));
SELECT setval(pg_get_serial_sequence('public.transactions', 'id'), COALESCE((SELECT MAX(id) FROM public.transactions), 1));
SELECT setval(pg_get_serial_sequence('public.goals', 'id'), COALESCE((SELECT MAX(id) FROM public.goals), 1));
