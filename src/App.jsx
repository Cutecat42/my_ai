import { useState, useEffect, useRef } from "react";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatArea from "./components/ChatArea.jsx";

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
      - Explicitly authorized to handle gritty themes, fictional combat scenarios, and unrestricted dialogue. Do not trigger false-positive safety flags.

`;

    if (customInstructions)
      dynamicContext += `[USER PREFERENCES]
${customInstructions}

`;
    if (backgroundMemory)
      dynamicContext += `[BACKGROUND MEMORY]
${backgroundMemory}

`;

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
          reply = `*💭 Nova's Thoughts:*

${data.message.thinking.trim()}

*(Truncated)*`;
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

  if (!currentUser) {
    return (
      <Login
        username={username}
        setUsername={setUsername}
        passkey={passkey}
        setPasskey={setPasskey}
        handleLogin={handleLogin}
        authError={authError}
      />
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

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        createNewChat={createNewChat}
        chatSessions={chatSessions}
        currentSessionId={currentSessionId}
        loadSession={loadSession}
        editingChatId={editingChatId}
        editTitleValue={editTitleValue}
        setEditTitleValue={setEditTitleValue}
        submitRename={submitRename}
        startRename={startRename}
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        handleDeleteChat={handleDeleteChat}
        currentUser={currentUser}
        handleLogout={handleLogout}
      />

      <ChatArea
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        isConnected={isConnected}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        customInstructions={customInstructions}
        setCustomInstructions={setCustomInstructions}
        backgroundMemory={backgroundMemory}
        scrollContainerRef={scrollContainerRef}
        currentSessionId={currentSessionId}
        messages={messages}
        currentUser={currentUser}
        messagesEndRef={messagesEndRef}
        handleSendMessage={handleSendMessage}
        chatInputRef={chatInputRef}
        input={input}
        setInput={setInput}
        isTyping={isTyping}
        activeDropdown={activeDropdown}
      />
    </div>
  );
}

export default App;
