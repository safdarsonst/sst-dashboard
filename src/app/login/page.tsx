"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Truck, Mail } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      background: "#f8fafc",
      padding: 20
    }}>
      <div style={{ 
        width: "100%", 
        maxWidth: 420, 
        background: "white", 
        borderRadius: 12, 
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        padding: 40
      }}>
        {/* Logo/Title */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ 
            width: 48, 
            height: 48, 
            borderRadius: 12, 
            background: "#1d4ed8", 
            display: "grid", 
            placeItems: "center", 
            margin: "0 auto 16px",
            color: "white"
          }}>
            <Truck size={24} />
          </div>
          <h1 style={{ 
            fontSize: 24, 
            fontWeight: 700, 
            color: "#111827", 
            marginBottom: 8 
          }}>
            SST Operations
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Internal Operations Portal
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={signIn} style={{ display: "grid", gap: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail size={16} style={{ 
                position: "absolute", 
                left: 12, 
                top: "50%", 
                transform: "translateY(-50%)", 
                color: "#000000" 
              }} />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ 
                  width: "100%", 
                  padding: "12px 12px 12px 40px", 
                  borderRadius: 8, 
                  border: "1px solid #75757aff",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f9fafb",
                  color: "#000000"
                }}
                type="email"
                required
                placeholder="staff@company.com"
                onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <Truck size={16} style={{ 
                position: "absolute", 
                left: 12, 
                top: "50%", 
                transform: "translateY(-50%)", 
                color: "#000000" 
              }} />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ 
                  width: "100%", 
                  padding: "12px 12px 12px 40px", 
                  borderRadius: 8, 
                  border: "1px solid #75757aff",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  background: "#f9fafb",
                  color: "#000000"
                }}
                type="password"
                required
                placeholder="••••••••"
                onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
              />
            </div>
          </div>

          <button 
            disabled={busy} 
            style={{ 
              padding: "12px", 
              background: "#1d4ed8",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
              transition: "background 0.2s",
              marginTop: 8
            }}
            type="submit"
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = "#1e40af";
            }}
            onMouseLeave={(e) => {
              if (!busy) e.currentTarget.style.background = "#1d4ed8";
            }}
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>

          {error && (
            <div style={{ 
              padding: "12px", 
              background: "#f2e4e4ff", 
              border: "1px solid #fecaca", 
              borderRadius: 8,
              color: "#991b1b",
              fontSize: 14
            }}>
              {error}
            </div>
          )}
        </form>

        <div style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ color: "#6b7280", fontSize: 12, textAlign: "center" }}>
            For internal staff use only
          </p>
        </div>
      </div>
    </div>
  );
}