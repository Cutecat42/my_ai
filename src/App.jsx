import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

function App() {
  // --- Auth State ---
  const [isLocked, setIsLocked] = useState(true);
  const [passkey, setPasskey] = useState("");
  const [authError, setAuthError] = useState("");

  const SECRET_PASSPHRASE = import.meta.env.VITE_SECRET_PASSPHRASE;

  // --- Connection & Chat States ---
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const TUNNEL_URL = "https://prefers-starting-bar-rear.trycloudflare.com";
  const OLLAMA_MODEL = "gemma4:12b";

  // Check connection automatically once unlocked
  useEffect(() => {
    if (!isLocked) {
      checkConnection();
    }
  }, [isLocked]);

  async function checkConnection() {
    try {
      const res = await fetch(`${TUNNEL_URL}/api/tags`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      setIsConnected(res.ok);
    } catch (error) {
      console.error("Connection check failed:", error);
      setIsConnected(false);
    }
  }

  function handleLogin(e) {
    e.preventDefault();
    if (passkey === SECRET_PASSPHRASE) {
      setIsLocked(false);
      setAuthError("");
    } else {
      setAuthError("Incorrect passphrase.");
      setPasskey("");
    }
  }

  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userMessage },
      { role: "ai", text: "" },
    ]);
    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch(`${TUNNEL_URL}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: userMessage,
          stream: false,
          think: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setIsConnected(true);
      const data = await res.json();

      if (data.response) {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIndex = updated.length - 1;
          updated[lastIndex] = {
            ...updated[lastIndex],
            text: data.response,
          };
          return updated;
        });
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: `❌ Error: ${error.message}` },
      ]);
      setIsConnected(false);
    } finally {
      setIsTyping(false);
    }
  }

  // --- Locked View ---
  if (isLocked) {
    return (
      <div
        key="locked-screen"
        style={{
          maxWidth: "400px",
          margin: "100px auto",
          padding: "20px",
          fontFamily: "sans-serif",
          border: "1px solid #ccc",
          borderRadius: "8px",
          textAlign: "center",
        }}
      >
        <h2>AI Portal Restricted</h2>
        <p>Please enter the passphrase to access the model.</p>
        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: "10px" }}
        >
          <input
            type="text"
            name="username"
            defaultValue="AI-Portal"
            autoComplete="username"
            style={{ display: "none" }}
            readOnly
          />
          <input
            id="app-passphrase"
            name="password"
            type="password"
            autoComplete="current-password"
            value={passkey}
            onChange={(e) => setPasskey(e.target.value)}
            placeholder="Passphrase"
            style={{
              padding: "10px",
              fontSize: "16px",
              borderRadius: "4px",
              border: "1px solid #ccc",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "10px",
              fontSize: "16px",
              background: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Enter
          </button>
        </form>
        {authError && (
          <div style={{ color: "red", marginTop: "10px" }}>{authError}</div>
        )}
      </div>
    );
  }

  // --- Unlocked Chat View ---
  return (
    <div
      key="chat-screen"
      style={{
        maxWidth: "700px",
        margin: "40px auto",
        padding: "20px",
        fontFamily: "sans-serif",
        border: "1px solid #ccc",
        borderRadius: "8px",
      }}
    >
      <style>{`
        @keyframes geminiPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        /* Resets basic markdown margins inside chat bubbles so they stay clean */
        .markdown-body p { margin: 0 0 8px 0; }
        .markdown-body p:last-child { margin: 0; }
        .markdown-body h3 { margin: 12px 0 6px 0; font-size: 1.1em; }
        .markdown-body ul, .markdown-body ol { margin: 0 0 8px 0; padding-left: 20px; }
      `}</style>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
        }}
      >
        <h2 style={{ margin: "0", color: "#28a745" }}>AI Chat Interface</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: "bold", fontSize: "14px" }}>
            Connected:{" "}
            <span style={{ color: isConnected ? "#28a745" : "#dc3545" }}>
              {isConnected ? "True" : "False"}
            </span>
          </span>
          <button
            onClick={checkConnection}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              background: "#f1f3f4",
              color: "#333",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>

      <div
        style={{
          height: "450px",
          overflowY: "auto",
          background: "#f8f9fa",
          padding: "15px",
          borderRadius: "4px",
          border: "1px solid #ddd",
          marginBottom: "15px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: "#666", textAlign: "center", margin: "auto" }}>
            Send a message to test {OLLAMA_MODEL}.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background: msg.role === "user" ? "#1a73e8" : "#e9ecef",
              color: msg.role === "user" ? "#fff" : "#000",
              padding: "10px 16px",
              borderRadius: "16px",
              maxWidth: "85%",
              wordWrap: "break-word",
              lineHeight: "1.5",
              whiteSpace: "pre-wrap", // Handles raw newlines correctly
              textAlign: "left", // Ensures AI responses read naturally left-to-right
            }}
          >
            {msg.role === "ai" && msg.text === "" ? (
              <div style={{ display: "flex", gap: "5px", padding: "6px 0" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    background: "#666",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "geminiPulse 1.2s infinite ease-in-out both",
                    animationDelay: "0s",
                  }}
                />
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    background: "#666",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "geminiPulse 1.2s infinite ease-in-out both",
                    animationDelay: "0.2s",
                  }}
                />
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    background: "#666",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "geminiPulse 1.2s infinite ease-in-out both",
                    animationDelay: "0.4s",
                  }}
                />
              </div>
            ) : msg.role === "ai" ? (
              <div className="markdown-body">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              msg.text
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSendMessage}
        style={{ display: "flex", gap: "10px" }}
      >
        <input
          key="chat-message-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isTyping}
          placeholder={isTyping ? "AI is processing..." : "Type a message..."}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: "16px",
            borderRadius: "4px",
            border: "1px solid #ccc",
          }}
        />
        <button
          type="submit"
          disabled={isTyping || !input.trim()}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            background: isTyping || !input.trim() ? "#ccc" : "#1a73e8",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: isTyping || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default App;
