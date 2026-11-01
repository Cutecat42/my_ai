import { useState, useEffect, useRef } from "react";
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

  // --- Compression ---
  const [backgroundMemory, setBackgroundMemory] = useState("");
  const [isConsolidating, setIsConsolidating] = useState(false);

  const TUNNEL_URL = "https://prefers-starting-bar-rear.trycloudflare.com";
  const OLLAMA_MODEL = "gemma4:12b";

  // --- Layout DOM Refs ---
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // Check connection automatically once unlocked
  useEffect(() => {
    if (!isLocked) {
      checkConnection();
    }
  }, [isLocked]);

  // Automatically triggers whenever the chat history gets to be too much
  useEffect(() => {
    if (messages.length >= 24) {
      consolidateUniversalMemory();
    }
  }, [messages]);

  // Focus the chat input box the exact second the screen unlocks
  useEffect(() => {
    if (!isLocked) {
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 50);
    }
  }, [isLocked]);

  // Handle precise scroll locks and loading dot targets
  useEffect(() => {
    if (isTyping && messages[messages.length - 1]?.text === "") {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 30);
    } else if (!isTyping && messages.length > 0) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollTop;
      }
      chatInputRef.current?.focus();
    }
  }, [isTyping]);

  async function checkConnection() {
    try {
      const res = await fetch(TUNNEL_URL + "/api/tags", {
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

    const recentChatHistory = messages
      .map((m) => (m.role === "user" ? "User: " : "AI: ") + m.text)
      .join("\n");

    const optimizedPrompt = backgroundMemory
      ? "[System Background Memory]\n" +
        backgroundMemory +
        "\n\n[Recent Conversation History]\n" +
        recentChatHistory +
        "\nUser: " +
        userMessage
      : "[Recent Conversation History]\n" +
        recentChatHistory +
        "\nUser: " +
        userMessage;

    try {
      const res = await fetch(TUNNEL_URL + "/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: optimizedPrompt,
          stream: false,
          think: false,
        }),
      });

      if (!res.ok) {
        throw new Error("HTTP " + res.status);
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
        { role: "ai", text: "❌ Error: " + error.message },
      ]);
      setIsConnected(false);
    } finally {
      setIsTyping(false);
    }
  }

  async function consolidateUniversalMemory() {
    if (messages.length < 20 || isConsolidating) return;

    setIsConsolidating(true);

    const archiveLog = messages
      .map((m) => (m.role === "user" ? "User: " : "AI: ") + m.text)
      .join("\n");

    const compressionPrompt = `You are a strict Universal Long-Term Continuity Engine. Analyze the following historical log and existing background memory profile, then generate an updated, optimized memory stack.

      CRITICAL ARCHIVAL LAW:
      1. You must maintain a "PERMANENT GLOBAL ANCHORS" section. This is a protected vault for vital, non-negotiable details that define the user, environment, setting, or cumulative session history. NEVER drop or prune details in this section. You MUST permanently preserve:
        - Personal Anchors: (User identity markers, pets names/colors, current college/life status).
        - Technical & Style Settings: (Target names like "Gemm", active tech stacks, hardware constraints, or core design rules).
        - Hard Lessons & Scenarios Learned: (Irreversible takeaways, cumulative game milestones like Scenario 1/2 lessons, or critical coding bug-fixes discovered).
      2. Maintain a "FLUID GAME STATE & CONTEXT" section for active tasks. Track current mathematical parameters, fluid project variables, temporary active rules, or scene-specific narrative context. Consolidate overlapping changes and drop out-of-date parameters.
      3. Keep the total output tightly packed, structured, and under a strict 250-word maximum.

      Your response must strictly follow this exact structural markdown layout:

      ### 🌟 PERMANENT GLOBAL ANCHORS
      (Incorporate existing global anchors. Always preserve core user identity, cats, college status, custom names, cumulative scenario lessons learned, and vital tech/life rules here.)

      ### ⚙️ FLUID GAME STATE & CONTEXT
      (List active game variables, numerical parameters, current coding tasks, or temporary scene-specific guidelines here.)

      ### 🎬 RECENT CHRONOLOGICAL MILESTONES
      (List the single most recent major milestone achieved or the current question pending action.)

      Do not use conversational filler or meta-commentary.

      [Existing Background Memory Profile]:
      ${backgroundMemory || "No prior history."}

      [Recent Historical Log to Absorb]:
      ${archiveLog}`;

    try {
      const res = await fetch(TUNNEL_URL + "/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: compressionPrompt,
          stream: false,
          think: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.response) {
          setBackgroundMemory(data.response.trim());
          setMessages((prev) => prev.slice(-4));
          console.log("Universal memory stack successfully consolidated.");
        }
      }
    } catch (error) {
      console.error(
        "Memory consolidation routine encountered an error:",
        error,
      );
    } finally {
      setIsConsolidating(false);
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
        width: "94%",
        maxWidth: "1400px",
        height: "calc(100vh - 40px)",
        margin: "20px auto",
        padding: "15px",
        fontFamily: "sans-serif",
        border: "1px solid #ccc",
        borderRadius: "12px",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes geminiPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        .markdown-body p { margin: 0 0 8px 0; }
        .markdown-body p:last-child { margin: 0; }
        .markdown-body h3 { margin: 12px 0 6px 0; font-size: 1.1em; }
        .markdown-body ul, .markdown-body ol { margin: 0 0 8px 0; padding-left: 20px; }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
        
        @media (max-width: 600px) {
          div[key="chat-screen"] { width: 100% !important; margin: 0 !important; height: 100vh !important; border-radius: 0 !important; border: none !important; padding: 10px !important; }
          .message-bubble { max-width: 90% !important; }
        }
      `}</style>

      {/* --- Header Section --- */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
          flexShrink: 0,
        }}
      >
        <h2 style={{ margin: "0", color: "#28a745", fontSize: "1.3rem" }}>
          AI Chat Interface
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontWeight: "bold", fontSize: "13px" }}>
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

      {/* --- Compression Engine Monitor Pane --- */}
      {backgroundMemory && (
        <div
          style={{
            padding: "10px 14px",
            background: "#e8f0fe",
            border: "1px solid #b4d2ff",
            borderRadius: "6px",
            marginBottom: "12px",
            fontSize: "13px",
            color: "#1a73e8",
            lineHeight: "1.4",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              marginBottom: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            🧠 Universal Memory Active:
            <span
              style={{
                fontWeight: "normal",
                fontStyle: "italic",
                color: isConsolidating ? "#dc3545" : "#28a745",
              }}
            >
              {isConsolidating
                ? "Consolidating new data..."
                : "Tracking background context"}
            </span>
          </div>
          <div
            style={{
              maxHeight: "75px",
              overflowY: "auto",
              background: "#ffffff",
              padding: "8px",
              borderRadius: "4px",
              fontSize: "11px",
              color: "#444",
              whiteSpace: "pre-wrap",
              border: "1px solid #d2e3fc",
              marginTop: "6px",
            }}
          >
            {backgroundMemory}
          </div>
        </div>
      )}

      {/* --- Core Scrollable Chat Messages Container --- */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          background: "#f8f9fa",
          padding: "15px",
          borderRadius: "6px",
          border: "1px solid #ddd",
          marginBottom: "12px",
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
            className="message-bubble"
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background: msg.role === "user" ? "#1a73e8" : "#e9ecef",
              color: msg.role === "user" ? "#fff" : "#000",
              padding: "10px 16px",
              borderRadius: "16px",
              maxWidth: "75%",
              wordWrap: "break-word",
              lineHeight: "1.5",
              whiteSpace: "pre-wrap",
              textAlign: "left",
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
        <div ref={messagesEndRef} />
      </div>

      {/* --- Action Layout Input Panel --- */}
      <form
        onSubmit={handleSendMessage}
        style={{ display: "flex", gap: "10px", flexShrink: 0 }}
      >
        <textarea
          ref={chatInputRef}
          key="chat-message-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Reset height to calculate scroll height accurately
            e.target.style.height = "24px";
            // Set the height dynamically based on the amount of typed text, capping it at 150px
            e.target.style.height =
              Math.min(e.target.scrollHeight - 12, 150) + "px";
          }}
          disabled={isTyping}
          placeholder={
            isTyping
              ? "AI is processing..."
              : "Type a message... (Enter to send, Shift+Enter for new line)"
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // Reset input bar height back to normal upon sending
              e.target.style.height = "24px";
              handleSendMessage(e);
            }
          }}
          style={{
            flex: 1,
            padding: "12px",
            fontSize: "16px",
            borderRadius: "6px",
            border: "1px solid #ccc",
            outline: "none",
            resize: "none",
            height: "24px",
            minHeight: "24px",
            maxHeight: "150px",
            overflowY: "auto",
            fontFamily: "sans-serif",
            lineHeight: "1.4",
            boxSizing: "content-box",
          }}
        />

        <button
          type="submit"
          disabled={isTyping || !input.trim()}
          style={{
            padding: "10px 24px",
            fontSize: "16px",
            background: isTyping || !input.trim() ? "#ccc" : "#1a73e8",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: isTyping || !input.trim() ? "not-allowed" : "pointer",
            height: "50px",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

export default App;
