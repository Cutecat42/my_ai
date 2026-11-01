import { useState, useEffect } from "react";

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

  const TUNNEL_URL =
    "https://manufacturing-horizontal-turns-majority.trycloudflare.com";
  const OLLAMA_MODEL = "gemma4:26b";

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
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    // Add the user's message and an empty AI message bubble to fill in live
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
          // Stream tokens live as they generate
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setIsConnected(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.trim() !== "") {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              // Append each new word to the last message bubble
              setMessages((prev) => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  text: updated[lastIndex].text + parsed.response,
                };
                return updated;
              });
            }
          }
        }
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
            type="password"
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
      style={{
        maxWidth: "600px",
        margin: "40px auto",
        padding: "20px",
        fontFamily: "sans-serif",
        border: "1px solid #ccc",
        borderRadius: "8px",
      }}
    >
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
          height: "300px",
          overflowY: "auto",
          background: "#f8f9fa",
          padding: "15px",
          borderRadius: "4px",
          border: "1px solid #ddd",
          marginBottom: "15px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
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
              padding: "8px 14px",
              borderRadius: "16px",
              maxWidth: "80%",
              wordWrap: "break-word",
              lineHeight: "1.4",
            }}
          >
            {msg.text}
          </div>
        ))}
        {isTyping && (
          <div
            style={{
              alignSelf: "flex-start",
              color: "#666",
              fontSize: "0.9em",
              fontStyle: "italic",
            }}
          >
            AI is typing...
          </div>
        )}
      </div>

      <form
        onSubmit={handleSendMessage}
        style={{ display: "flex", gap: "10px" }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isTyping}
          style={{
            flex: 1,
            padding: "10px",
            fontSize: "16px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={isTyping || !input.trim()}
          style={{
            padding: "10px 20px",
            fontSize: "16px",
            background: isTyping || !input.trim() ? "#ccc" : "#28a745",
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
