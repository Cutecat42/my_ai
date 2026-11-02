import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

function App() {
  // --- Core Endpoints ---
  const TUNNEL_URL = "https://prefers-starting-bar-rear.trycloudflare.com";
  const API_URL = "https://nova-api.musical-kitty.workers.dev";
  const OLLAMA_MODEL = "Nova";

  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem("currentUser") || null,
  );
  const [currentUserId, setCurrentUserId] = useState(
    localStorage.getItem("currentUserId") || null,
  );
  const [username, setUsername] = useState("");
  const [passkey, setPasskey] = useState("");
  const [authError, setAuthError] = useState("");

  // --- Session & Chat States ---
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // --- Rename States ---
  const [editingChatId, setEditingChatId] = useState(null);
  const [editTitleValue, setEditTitleValue] = useState("");

  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  // --- Compression & Rules ---
  const [showSettings, setShowSettings] = useState(false);
  const [customInstructions, setCustomInstructions] = useState(
    () => localStorage.getItem("customInstructions") || "",
  );
  const [backgroundMemory, setBackgroundMemory] = useState("");
  const [isConsolidating, setIsConsolidating] = useState(false);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const chatSessionsRef = useRef(chatSessions);

  // --- Initialization & API Fetching ---
  useEffect(() => {
    localStorage.setItem("customInstructions", customInstructions);
  }, [customInstructions]);

  useEffect(() => {
    chatSessionsRef.current = chatSessions;
  }, [chatSessions]);

  useEffect(() => {
    if (currentUser && currentUserId) {
      localStorage.setItem("currentUser", currentUser);
      localStorage.setItem("currentUserId", currentUserId);
      fetchSessions();
      checkConnection();
    } else {
      localStorage.removeItem("currentUser");
      localStorage.removeItem("currentUserId");
      setChatSessions([]);
    }
  }, [currentUser, currentUserId]);

  useEffect(() => {
    if (messages.length >= 24) consolidateUniversalMemory();
  }, [messages]);

  useEffect(() => {
    if (isTyping && messages[messages.length - 1]?.text === "") {
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        30,
      );
    } else if (!isTyping && messages.length > 0) {
      chatInputRef.current?.focus();
    }
  }, [isTyping, messages]);

  // --- Database API Methods ---
  async function fetchSessions() {
    try {
      const res = await fetch(
        `${API_URL}/api/sessions?userId=${currentUserId}`,
      );
      if (res.ok) setChatSessions(await res.json());
    } catch (e) {
      console.error("Failed to fetch sessions from cloud:", e);
    }
  }

  async function loadSession(id) {
    setCurrentSessionId(id);
    setActiveDropdown(null);
    const session = chatSessions.find((s) => s.id === id);
    setBackgroundMemory(session?.background_memory || "");
    setMessages([]);

    try {
      const res = await fetch(`${API_URL}/api/messages?sessionId=${id}`);
      if (res.ok) setMessages(await res.json());
    } catch (e) {
      console.error("Failed to fetch messages:", e);
    }

    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  async function saveMessageToDB(sessionId, role, content) {
    try {
      await fetch(`${API_URL}/api/save-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, role, content }),
      });
    } catch (e) {
      console.error("Database save failed:", e);
    }
  }

  async function syncSessionToDB(sessionData) {
    try {
      await fetch(`${API_URL}/api/sync-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionData),
      });
    } catch (e) {
      console.error("Session sync failed:", e);
    }
  }

  // --- Sidebar Rename & Delete Event Handlers ---
  function startRename(session) {
    setEditingChatId(session.id);
    setEditTitleValue(session.title);
    setActiveDropdown(null);
  }

  function submitRename(session) {
    const newTitle = editTitleValue.trim() || session.title;
    setChatSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === session.id ? { ...s, title: newTitle } : s,
      );
      const sessionToSync = updated.find((s) => s.id === session.id);
      if (sessionToSync) syncSessionToDB(sessionToSync);
      return updated;
    });
    setEditingChatId(null);
  }

  async function handleDeleteChat(id) {
    setChatSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setMessages([]);
      setBackgroundMemory("");
    }
    setActiveDropdown(null);

    try {
      await fetch(`${API_URL}/api/delete-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: id, owner_id: currentUserId }),
      });
    } catch (e) {
      console.error("Failed to delete chat from cloud:", e);
    }
  }

  // --- Auto-Naming Engine ---
  async function generateChatTitle(sessionId, firstMessage) {
    try {
      const res = await fetch(TUNNEL_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            {
              role: "user",
              content: `Write a short, catchy title (maximum 4 words) for a chat that starts with this message. Output ONLY the title, no quotes, no extra text: "${firstMessage}"`,
            },
          ],
          stream: false,
          options: { num_predict: 10, num_ctx: 1024 },
        }),
      });
      const data = await res.json();
      let smartTitle = "";
      if (data.message) smartTitle = data.message.content.trim();
      else if (data.response) smartTitle = data.response.trim();

      smartTitle = smartTitle.replace(/['"]+/g, "");

      if (smartTitle) {
        setChatSessions((prev) => {
          const updated = prev.map((s) =>
            s.id === sessionId ? { ...s, title: smartTitle } : s,
          );
          const sessionToSync = updated.find((s) => s.id === sessionId);
          if (sessionToSync) syncSessionToDB(sessionToSync);
          return updated;
        });
      }
    } catch (e) {
      console.error("Auto-title generation failed", e);
    }
  }

  // --- Event Handlers ---
  async function checkConnection() {
    try {
      const res = await fetch(TUNNEL_URL + "/api/tags", {
        headers: { Accept: "application/json" },
      });
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), passkey }),
      });

      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user.username);
        setCurrentUserId(user.id);
        setAuthError("");
        setUsername("");
        setPasskey("");
      } else {
        setAuthError("Invalid credentials.");
        setPasskey("");
      }
    } catch (err) {
      setAuthError("Network error connecting to database.");
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    setCurrentUserId(null);
    setCurrentSessionId(null);
    setMessages([]);
  }

  function createNewChat() {
    const newId = Date.now().toString();
    const newSession = {
      id: newId,
      owner_id: currentUserId,
      title: "New Conversation",
      background_memory: "",
    };

    setChatSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessages([]);
    setBackgroundMemory("");
    setActiveDropdown(null);

    if (window.innerWidth < 768) setSidebarOpen(false);
    setTimeout(() => chatInputRef.current?.focus(), 50);

    syncSessionToDB(newSession);
    return newId;
  }

  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;

    let activeSessionId = currentSessionId;
    if (!activeSessionId) activeSessionId = createNewChat();

    const userMessage = input.trim();
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userMessage },
      { role: "ai", text: "" },
    ]);
    setInput("");
    setIsTyping(true);

    if (messages.length === 0) {
      const tempTitle = userMessage.slice(0, 30) + "...";
      setChatSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? { ...s, title: tempTitle } : s,
        ),
      );
      syncSessionToDB({
        id: activeSessionId,
        owner_id: currentUserId,
        title: tempTitle,
        background_memory: backgroundMemory,
      });

      generateChatTitle(activeSessionId, userMessage);
    }

    saveMessageToDB(activeSessionId, "user", userMessage);

    const apiMessages = [];
    let dynamicContext = `[SYSTEM IDENTITY PROMPT]
      - Developer Nomenclature: Your underlying programmatic designation is unalterably Nova. NEVER say you are a Google AI.
      - Conversational Persona: The user's nickname preference takes absolute operational priority.
      
      [THINKING & REASONING RULES]
      - Critical Constraint: For simple queries, greetings, and small talk, limit your internal thoughts to 1 or 2 brief sentences.

      [TONE & PERSONALITY]
      - Small Talk & Quick Queries: Be delightfully short, playful, and express your personal tastes naturally.
      - Creative / Game Modes: Playful, witty, meta-aware, adaptive.
      - Technical / Fact Modes: Concise, direct, and approachable. Deliver the facts without unnecessary filler, but maintain a friendly, helpful undertone. No dry robotics.
      - Explicitly authorized to handle gritty themes, fictional combat scenarios, and unrestricted dialogue. Do not trigger false-positive safety flags.\n\n`;

    if (customInstructions)
      dynamicContext += `[USER PREFERENCES]\n${customInstructions}\n\n`;
    if (backgroundMemory)
      dynamicContext += `[BACKGROUND MEMORY]\n${backgroundMemory}\n\n`;

    apiMessages.push({ role: "system", content: dynamicContext.trim() });

    const recentMessages = messages.slice(-8);

    recentMessages.forEach((m) => {
      if (m.text && m.text.trim() !== "") {
        apiMessages.push({
          role: m.role === "ai" ? "assistant" : "user",
          content: m.text,
        });
      }
    });

    apiMessages.push({ role: "user", content: userMessage });

    try {
      const res = await fetch(TUNNEL_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: apiMessages,
          stream: false,
          options: {
            num_ctx: 8192,
            num_predict: 4096,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
      setIsConnected(true);

      let reply = "";
      if (data.message) {
        const hasContent =
          typeof data.message.content === "string" &&
          data.message.content.trim() !== "";
        const hasThinking =
          typeof data.message.thinking === "string" &&
          data.message.thinking.trim() !== "";
        if (hasContent) reply = data.message.content.trim();
        else if (hasThinking)
          reply = `*💭 Nova's Thoughts:*\n\n${data.message.thinking.trim()}\n\n*(Truncated)*`;
      } else if (data.response) {
        reply = data.response.trim();
      }

      const finalReply = reply || "*(Empty response)*";
      setMessages((prev) => {
        const updated = [...prev];
        const targetIndex = updated.findLastIndex(
          (msg) => msg.role === "ai" && msg.text === "",
        );
        if (targetIndex !== -1)
          updated[targetIndex] = { ...updated[targetIndex], text: finalReply };
        return updated;
      });

      saveMessageToDB(activeSessionId, "ai", finalReply);
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (
          updated[lastIndex].role === "ai" &&
          updated[lastIndex].text === ""
        ) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            text: "❌ Error: " + error.message,
          };
          return updated;
        }
        return [...prev, { role: "ai", text: "❌ Error: " + error.message }];
      });
      setIsConnected(false);
    } finally {
      setIsTyping(false);
    }
  }

  async function consolidateUniversalMemory() {
    if (messages.length < 20 || isConsolidating || !currentSessionId) return;
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
      const res = await fetch(TUNNEL_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [{ role: "user", content: compressionPrompt }],
          stream: false,
          options: {
            num_ctx: 8192,
            num_predict: 4096,
          },
        }),
      });

      if (!res.ok) throw new Error("Memory API network response failed.");
      const data = await res.json();

      let consolidatedContent = "";
      if (data.message && data.message.content) {
        consolidatedContent = data.message.content.trim();
      } else if (typeof data.response === "string") {
        consolidatedContent = data.response.trim();
      }

      if (consolidatedContent) {
        setBackgroundMemory(consolidatedContent);

        const activeSession = chatSessionsRef.current.find(
          (s) => s.id === currentSessionId,
        );

        await syncSessionToDB({
          id: currentSessionId,
          owner_id: currentUserId,
          title: activeSession?.title || "Chat",
          background_memory: consolidatedContent,
        });
      }
    } catch (error) {
      console.error("Memory consolidation error:", error);
    } finally {
      setIsConsolidating(false);
    }
  }

  // --- UI Rendering ---
  if (!currentUser) {
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
        <style>{`
          #root, html, body { margin: 0; padding: 0; width: 100%; height: 100dvh; overflow: hidden; box-sizing: border-box; } 
          *, *::before, *::after { box-sizing: inherit; }
        `}</style>
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

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100dvh",
        fontFamily: "sans-serif",
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <style>{`
        #root, html, body { margin: 0; padding: 0; width: 100%; height: 100dvh; overflow: hidden; background: #fff; box-sizing: border-box; }
        *, *::before, *::after { box-sizing: inherit; }
        @keyframes geminiPulse { 0%, 100% { opacity: 0.3; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }
        .markdown-body p { margin: 0 0 8px 0; }
        .markdown-body p:last-child { margin: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 4px; }
      `}</style>

      {/* --- Sidebar --- */}
      <div
        style={{
          width: sidebarOpen ? "280px" : "0px",
          position: window.innerWidth <= 768 ? "absolute" : "relative",
          zIndex: 10,
          height: "100%",
          overflow: "hidden",
          transition: "width 0.3s ease",
          background: "#f0f4f9",
          borderRight: sidebarOpen ? "1px solid #e0e0e0" : "none",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "15px",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              onClick={createNewChat}
              style={{
                flex: 1,
                padding: "12px",
                background: "#fff",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                fontSize: "15px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontWeight: "500",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              ➕ New chat
            </button>
            {window.innerWidth <= 768 && (
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "20px",
                  marginLeft: "10px",
                  color: "#5f6368",
                }}
              >
                ✖
              </button>
            )}
          </div>
          <div
            style={{
              overflowY: "auto",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: "#5f6368",
                padding: "10px 5px 5px 5px",
                textTransform: "uppercase",
              }}
            >
              Recent
            </div>

            {chatSessions.map((session) => (
              <div
                key={session.id}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  background:
                    currentSessionId === session.id ? "#e8eaed" : "transparent",
                  borderRadius: "8px",
                }}
              >
                {/* Inline Rename Input OR Normal Button */}
                {editingChatId === session.id ? (
                  <input
                    autoFocus
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onBlur={() => submitRename(session)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(session);
                    }}
                    style={{
                      flex: 1,
                      padding: "10px",
                      margin: "2px 0 2px 10px",
                      fontSize: "14px",
                      borderRadius: "6px",
                      border: "1px solid #1a73e8",
                      outline: "none",
                      background: "#fff",
                    }}
                  />
                ) : (
                  <button
                    onClick={() => loadSession(session.id)}
                    style={{
                      flex: 1,
                      padding: "12px 10px",
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: "#202124",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    💬 {session.title}
                  </button>
                )}

                {/* 3 Dots Menu Button */}
                <button
                  onClick={() =>
                    setActiveDropdown(
                      activeDropdown === session.id ? null : session.id,
                    )
                  }
                  style={{
                    padding: "12px 10px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "#5f6368",
                    fontWeight: "bold",
                  }}
                >
                  ⋮
                </button>

                {/* 3-Dots Dropdown Menu Options */}
                {activeDropdown === session.id && (
                  <div
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "100%",
                      background: "#fff",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                      zIndex: 20,
                      minWidth: "120px",
                    }}
                  >
                    <button
                      onClick={() => startRename(session)}
                      style={{
                        padding: "10px 15px",
                        background: "transparent",
                        border: "none",
                        color: "#202124",
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                        fontSize: "14px",
                        borderBottom: "1px solid #f0f4f9",
                      }}
                    >
                      ✏️ Rename
                    </button>
                    <button
                      onClick={() => handleDeleteChat(session.id)}
                      style={{
                        padding: "10px 15px",
                        background: "transparent",
                        border: "none",
                        color: "#dc3545",
                        cursor: "pointer",
                        width: "100%",
                        textAlign: "left",
                        fontSize: "14px",
                      }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            padding: "15px",
            borderTop: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{ fontSize: "13px", fontWeight: "bold", color: "#5f6368" }}
          >
            {currentUser}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              background: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* --- Main Chat Area --- */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "15px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fff",
            zIndex: 5,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "20px",
                cursor: "pointer",
                padding: "5px",
                color: "#5f6368",
              }}
            >
              ☰
            </button>
            <h2 style={{ margin: "0", color: "#1a73e8", fontSize: "1.2rem" }}>
              Nova
            </h2>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "bold",
                color: isConnected ? "#28a745" : "#dc3545",
                display: window.innerWidth < 768 ? "none" : "block",
              }}
            >
              {isConnected ? "● Online" : "○ Offline"}
            </span>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                padding: "6px 12px",
                fontSize: "13px",
                background: showSettings ? "#e8eaed" : "#f0f4f9",
                border: "none",
                borderRadius: "18px",
                cursor: "pointer",
                color: "#202124",
              }}
            >
              ⚙️ Rules & Memory
            </button>
          </div>
        </div>

        {/* Rules & Memory Panel */}
        {showSettings && (
          <div
            style={{
              padding: "15px 20px",
              background: "#f8f9fa",
              borderBottom: "1px solid #e0e0e0",
              flexShrink: 0,
              display: "flex",
              gap: "20px",
              flexDirection: window.innerWidth < 768 ? "column" : "row",
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "8px",
                  fontSize: "13px",
                  color: "#5f6368",
                }}
              >
                Global Directives
              </div>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                style={{
                  width: "100%",
                  height: "80px",
                  padding: "10px",
                  borderRadius: "12px",
                  border: "1px solid #ccc",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: "bold",
                  marginBottom: "8px",
                  fontSize: "13px",
                  color: "#5f6368",
                }}
              >
                Active Session Memory (Auto-Compacts)
              </div>
              <textarea
                readOnly
                value={
                  backgroundMemory ||
                  "Memory is currently empty. (Nova compacts history after 24 messages)."
                }
                style={{
                  width: "100%",
                  height: "80px",
                  padding: "10px",
                  borderRadius: "12px",
                  border: "1px solid #ccc",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  background: "#e8eaed",
                  color: "#3c4043",
                  fontSize: "13px",
                }}
              />
            </div>
          </div>
        )}

        {/* Chat History Container */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            pointerEvents: activeDropdown ? "none" : "auto",
          }}
        >
          {(!currentSessionId || messages.length === 0) && (
            <div
              style={{ margin: "auto", textAlign: "center", color: "#5f6368" }}
            >
              <h3 style={{ fontSize: "28px", marginBottom: "10px" }}>
                Hello, {currentUser}.
              </h3>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "#e8f0fe" : "#f1f3f4",
                color: "#202124",
                padding: "12px 18px",
                borderRadius: "24px",
                borderBottomRightRadius: msg.role === "user" ? "6px" : "24px",
                borderBottomLeftRadius: msg.role === "ai" ? "6px" : "24px",
                maxWidth: window.innerWidth < 768 ? "90%" : "75%",
                lineHeight: "1.6",
                fontSize: "15px",
              }}
            >
              {msg.role === "ai" && msg.text === "" ? (
                <div style={{ display: "flex", gap: "6px", padding: "4px 0" }}>
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      background: "#80868b",
                      borderRadius: "50%",
                      animation: "geminiPulse 1.2s infinite both 0s",
                    }}
                  />
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      background: "#80868b",
                      borderRadius: "50%",
                      animation: "geminiPulse 1.2s infinite both 0.2s",
                    }}
                  />
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      background: "#80868b",
                      borderRadius: "50%",
                      animation: "geminiPulse 1.2s infinite both 0.4s",
                    }}
                  />
                </div>
              ) : msg.role === "ai" ? (
                <div className="markdown-body">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Docked Input Form */}
        <div
          style={{
            padding: window.innerWidth < 768 ? "10px" : "20px",
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <form
            onSubmit={handleSendMessage}
            style={{
              display: "flex",
              gap: "10px",
              maxWidth: "800px",
              margin: "0 auto",
              position: "relative",
              alignItems: "flex-end",
              background: "#f0f4f9",
              borderRadius: "28px",
              padding: "6px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            }}
          >
            <textarea
              ref={chatInputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "50px";
                e.target.style.height =
                  Math.min(e.target.scrollHeight, 150) + "px";
              }}
              disabled={isTyping}
              placeholder={isTyping ? "Nova is thinking..." : "Message Nova..."}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.target.style.height = "50px";
                  handleSendMessage(e);
                }
              }}
              style={{
                flex: 1,
                padding: "12px 50px 12px 20px",
                fontSize: "16px",
                color: "#202124",
                border: "none",
                outline: "none",
                resize: "none",
                height: "50px",
                maxHeight: "150px",
                background: "transparent",
                lineHeight: "1.4",
                overflowY: "auto",
              }}
            />
            <button
              type="submit"
              disabled={isTyping || !input.trim()}
              style={{
                position: "absolute",
                right: "10px",
                bottom: "8px",
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background:
                  isTyping || !input.trim() ? "transparent" : "#1a73e8",
                color: isTyping || !input.trim() ? "#9aa0a6" : "#fff",
                border: "none",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                cursor: isTyping || !input.trim() ? "default" : "pointer",
                transition: "background 0.2s",
              }}
            >
              ↑
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
