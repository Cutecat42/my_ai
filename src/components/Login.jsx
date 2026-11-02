import React from "react";

function Login({
  username,
  setUsername,
  passkey,
  setPasskey,
  handleLogin,
  authError,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100dvh",
        width: "100%",
        background: "#f0f4f9",
      }}
    >
      <div
        style={{
          width: "90%",
          maxWidth: "360px",
          padding: "30px",
          background: "#fff",
          borderRadius: "24px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
          textAlign: "center",
        }}
      >
        <h2 style={{ color: "#1a73e8", marginBottom: "20px" }}>Nova Core</h2>
        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: "15px" }}
        >
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            style={{
              padding: "14px",
              fontSize: "16px",
              borderRadius: "12px",
              border: "1px solid #e0e0e0",
              outline: "none",
              background: "#f8f9fa",
              color: "#202124",
            }}
          />
          <input
            type="password"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            placeholder="Passphrase"
            style={{
              padding: "14px",
              fontSize: "16px",
              borderRadius: "12px",
              border: "1px solid #e0e0e0",
              outline: "none",
              background: "#f8f9fa",
              color: "#202124",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "14px",
              fontSize: "16px",
              background: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: "12px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Connect
          </button>
        </form>
        {authError && (
          <div
            style={{
              color: "#dc3545",
              marginTop: "15px",
              fontWeight: "bold",
            }}
          >
            {authError}
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;
