/**
 * supabase-config.js
 * Centralized Supabase initialization to prevent multiple client instances.
 */
const SUPABASE_URL = "https://ykjnfiovrhxwsnkbxuen.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlram5maW92cmh4d3Nua2J4dWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1NjAzNzEsImV4cCI6MjA4MjEzNjM3MX0.P9_dyHPwhFKxFQPNBECqR1nGQQ-_Kr2HLJJsZj9Nxz4";

// Attach to window so script.js and nav-algorithm.js can see it
window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
