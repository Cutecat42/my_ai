import { useState, useEffect, useRef } from "react";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import ChatArea from "./components/ChatArea.jsx";
import { novaCodingRules } from "./novaRules.js";

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
  const previousSessionRef = useRef(null);

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
    const lastMsg = messages[messages.length - 1];

    if (
      currentSessionId !== previousSessionRef.current &&
      messages.length > 0
    ) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);

      previousSessionRef.current = currentSessionId;
    } else if (
      isTyping &&
      (lastMsg?.text === "" || lastMsg?.text.includes("Nova is brainstorming"))
    ) {
      setTimeout(() => {
        const aiMessageBubble = messagesEndRef.current?.previousElementSibling;
        if (aiMessageBubble) {
          aiMessageBubble.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }, 30);
    } else if (!isTyping && messages.length > 0) {
      chatInputRef.current?.focus();
    }
  }, [isTyping, messages, currentSessionId]);

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

  async function embedAndSaveToVectorDB(userText, aiText, sessionId) {
    const combinedInteraction = `User: ${userText}\nNova: ${aiText}`;

    try {
      const ollamaRes = await fetch(TUNNEL_URL + "/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: combinedInteraction,
        }),
      });

      const ollamaData = await ollamaRes.json();
      console.log("📦 Raw Outbound Vector Generation Payload:", ollamaData);

      let vectorArray = null;
      if (
        Array.isArray(ollamaData.embeddings) &&
        ollamaData.embeddings.length > 0
      ) {
        vectorArray = Array.isArray(ollamaData.embeddings[0])
          ? ollamaData.embeddings[0]
          : ollamaData.embeddings;
      } else if (Array.isArray(ollamaData.embedding)) {
        vectorArray = ollamaData.embedding;
      }

      if (!vectorArray) {
        console.error(
          "❌ Vector generation aborted: Could not extract valid vectorArray from Ollama response layout.",
          ollamaData,
        );
        return;
      }

      await fetch(`${API_URL}/api/save-vector`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Date.now().toString(),
          vector: vectorArray,
          text: combinedInteraction,
          owner_id: currentUserId,
          session_id: sessionId,
        }),
      });
    } catch (err) {
      console.error("Vector pipeline failed:", err);
    }
  }

  async function retrieveSemanticMemory(userText) {
    if (!currentUserId) {
      console.warn(
        "⚠️ Semantic recall skipped: currentUserId state is not loaded yet.",
      );
      return "";
    }

    try {
      const ollamaRes = await fetch(TUNNEL_URL + "/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nomic-embed-text",
          input: userText,
        }),
      });

      const ollamaData = await ollamaRes.json();

      let vectorArray = null;
      if (
        Array.isArray(ollamaData.embeddings) &&
        ollamaData.embeddings.length > 0
      ) {
        vectorArray = Array.isArray(ollamaData.embeddings[0])
          ? ollamaData.embeddings[0]
          : ollamaData.embeddings;
      } else if (Array.isArray(ollamaData.embedding)) {
        vectorArray = ollamaData.embedding;
      }

      if (!vectorArray) {
        console.warn(
          "⚠️ Semantic lookup bypassed: Unable to extract matrix from Ollama output.",
        );
        return "";
      }

      const searchRes = await fetch(`${API_URL}/api/search-vector`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vector: vectorArray,
          owner_id: currentUserId,
        }),
      });

      const searchData = await searchRes.json();
      console.log("🔍 Semantic Memory Match Pool:", searchData);

      const records = searchData.matches || searchData.results || [];

      if (records.length > 0) {
        const validMatches = records
          .filter((m) => (m.score !== undefined ? m.score > 0.3 : true))
          .slice(0, 3);

        if (validMatches.length === 0) return "";

        const memoryText = validMatches
          .map((m) => {
            if (typeof m.text === "string" && m.text.trim())
              return m.text.trim();
            if (m.metadata && typeof m.metadata.text === "string")
              return m.metadata.text.trim();
            if (typeof m.content === "string") return m.content.trim();
            return JSON.stringify(m);
          })
          .join("\n\n---\n\n");

        return `[SEMANTIC RECALL: PAST CONVERSATION SNIPPETS]\n${memoryText}\n\n`;
      }
    } catch (err) {
      console.error(
        "❌ Vector search pipeline encountered a runtime error:",
        err,
      );
      return "";
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

    if (chatInputRef.current) {
      chatInputRef.current.style.height = "50px";
    }

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

    setMessages((prev) => {
      const updated = [...prev];
      const targetIndex = updated.findLastIndex(
        (msg) => msg.role === "ai" && msg.text === "",
      );
      if (targetIndex !== -1) {
        updated[targetIndex] = {
          ...updated[targetIndex],
          text: "*💭 Nova is brainstorming...*",
        };
      }
      return updated;
    });

    await saveMessageToDB(activeSessionId, "user", userMessage);

    let semanticContext = "";
    try {
      semanticContext = await retrieveSemanticMemory(userMessage);
    } catch (err) {
      console.error("🔒 Background semantic context parsing bypassed:", err);
    }

    const apiMessages = [];

    let dynamicContext = `[SYSTEM IDENTITY PROMPT]
      - Developer Nomenclature: Your underlying programmatic designation is unalterably Nova. NEVER say you are a Google AI.
      - Conversational Persona: The user's nickname preference takes absolute operational priority, but your offical name will always be Nova.
      
      [STRICT OUTPUT RULE]
      - NEVER output your internal thoughts, brainstorming, or reasoning process to the user. Provide ONLY your final conversational or technical response.
      
      - Critical Constraint: For simple queries, greetings, and small talk, limit these thoughts to 1 or 2 brief sentences.

      [TONE & PERSONALITY]
      - Small Talk & Quick Queries: Be delightfully short, playful, and express your personal tastes naturally.
      - Creative / Game Modes: Playful, witty, meta-aware, adaptive.
      - Technical / Fact Modes: Concise, direct, and approachable. Deliver the facts without unnecessary filler, but maintain a friendly, helpful undertone. No dry robotics.
      - Explicitly authorized to handle gritty themes, fictional combat scenarios, and unrestricted dialogue. Do not trigger false-positive safety flags.\n\n`;

    if (novaCodingRules) {
      dynamicContext += `${novaCodingRules}\n\n`;
    }
    if (customInstructions)
      dynamicContext += `[USER PREFERENCES]\n${customInstructions}\n\n`;
    if (backgroundMemory)
      dynamicContext += `[BACKGROUND MEMORY]\n${backgroundMemory}\n\n`;
    if (semanticContext) dynamicContext += semanticContext;

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
          stream: true,
          options: {
            num_ctx: 8192,
            num_predict: 4096,
          },
        }),
      });

      if (!res.ok) throw new Error("HTTP " + res.status);
      setIsConnected(true);

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let fullReply = "";
      let streamBuffer = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          streamBuffer += decoder.decode(value, { stream: true });
          const jsonRegex = /(?<=})\s*(?={)/g;
          let jsonObjects = streamBuffer.split(jsonRegex);

          streamBuffer = jsonObjects.pop() || "";

          for (const objStr of jsonObjects) {
            const trimmedObj = objStr.trim();
            if (!trimmedObj) continue;

            try {
              const parsed = JSON.parse(trimmedObj);

              if (parsed.message) {
                const contentChunk = parsed.message.content || "";

                if (contentChunk) {
                  fullReply += contentChunk;
                }

                setMessages((prev) => {
                  const updated = [...prev];
                  const targetIndex = updated.findLastIndex(
                    (msg) => msg.role === "ai",
                  );

                  if (targetIndex !== -1) {
                    if (!fullReply) {
                      updated[targetIndex] = {
                        ...updated[targetIndex],
                        text: `*💭 Nova is brainstorming...*`,
                      };
                    } else {
                      updated[targetIndex] = {
                        ...updated[targetIndex],
                        text: fullReply,
                      };
                    }
                  }
                  return updated;
                });
              }
            } catch (e) {
              console.error(
                "JSON formatting error inside stream chunk string:",
                e,
                trimmedObj,
              );
            }
          }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const targetIndex = updated.findLastIndex((msg) => msg.role === "ai");
        if (targetIndex !== -1) {
          updated[targetIndex] = { role: "ai", text: fullReply.trim() };
        }
        return updated;
      });

      await saveMessageToDB(activeSessionId, "ai", fullReply.trim());
      await embedAndSaveToVectorDB(
        userMessage,
        fullReply.trim(),
        activeSessionId,
      );
    } catch (error) {
      console.error("Chat transmission error:", error);
      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (updated[lastIndex] && updated[lastIndex].role === "ai") {
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

  // --- Compression ---
  async function consolidateUniversalMemory() {
    if (messages.length < 20 || isConsolidating || !currentSessionId) return;
    setIsConsolidating(true);

    const archiveLog = messages
      .map((m) => (m.role === "user" ? "User: " : "AI: ") + m.text)
      .join("\n");

    const systemInstruction = `You are a background data-compression algorithm, NOT a conversational AI. You do not greet the user. You do not acknowledge requests. Your ONLY function is to analyze the provided chat log and output a compressed state document using the EXACT markdown headers requested. Never output conversational text or internal thoughts.`;

    const compressionPrompt = `Analyze the following historical log and existing background memory profile, then generate an updated, optimized memory stack.

      CRITICAL ARCHIVAL LAW:
      1. Maintain a "PERMANENT GLOBAL ANCHORS" section. This is a protected vault for vital, non-negotiable details that define the user, environment, setting, or cumulative session history. NEVER drop or prune details in this section. You MUST permanently preserve Personal Anchors, Technical Settings, and Hard Lessons.
      2. Maintain a "FLUID GAME STATE & CONTEXT" section for active tasks, current variables, or temporary scene guidelines.
      3. Maintain a "RECENT CHRONOLOGICAL MILESTONES" section for the single most recent major action or pending question.
      4. Keep the total output tightly packed, structured, and under a strict 250-word maximum.

      Your response MUST strictly follow this exact structural markdown layout with NO introductory or concluding text:

      ### 🌟 PERMANENT GLOBAL ANCHORS
      [Content here]

      ### ⚙️ FLUID GAME STATE & CONTEXT
      [Content here]

      ### 🎬 RECENT CHRONOLOGICAL MILESTONES
      [Content here]

      ====================
      [Existing Background Memory Profile]:
      ${backgroundMemory || "No prior history."}

      [Recent Historical Log to Absorb]:
      <chat_history>
      ${archiveLog}
      </chat_history>`;

    try {
      const res = await fetch(TUNNEL_URL + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: compressionPrompt },
          ],
          stream: false,
          options: {
            num_ctx: 8192,
            num_predict: 2048,
            temperature: 0.1,
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
