import React from "react";

function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  createNewChat,
  chatSessions,
  currentSessionId,
  loadSession,
  editingChatId,
  editTitleValue,
  setEditTitleValue,
  submitRename,
  startRename,
  activeDropdown,
  setActiveDropdown,
  handleDeleteChat,
  currentUser,
  handleLogout,
}) {
  return (
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
              color: "#202124",
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

          {chatSessions?.map((session) => (
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
                    color: "#202124",
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
  );
}

export default Sidebar;
