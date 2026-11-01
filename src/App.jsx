import { useState } from "react";

function App() {
  const [status, setStatus] = useState("Idle - Click button to test");
  const [log, setLog] = useState("");

  const TUNNEL_URL =
    "https://manufacturing-horizontal-turns-majority.trycloudflare.com";

  async function testConnection() {
    setStatus("Sending request...");
    setLog("");

    try {
      const res = await fetch(`${TUNNEL_URL}/api/tags`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      setLog(`HTTP Status: ${res.status} ${res.statusText}\n`);

      if (res.ok) {
        const data = await res.json();
        setStatus("✅ SUCCESS! Connection and CORS are perfect.");
        setLog((prev) => prev + JSON.stringify(data, null, 2));
      } else {
        setStatus(`❌ FAILED! Server returned an error code.`);
        if (res.status === 403 || res.status === 401) {
          setLog(
            (prev) =>
              prev +
              " Cloudflare blocked the request or Ollama rejected the origin. Check your tunnel screen and OLLAMA_ORIGINS.",
          );
        }
      }
    } catch (error) {
      console.error("Diagnostic error details:", error);
      setStatus("💥 CRITICAL ERROR! Connection dropped or blocked.");
      setLog(
        (prev) =>
          prev +
          `JavaScript Catch Error: ${error.message}\n\nTroubleshooting tips:\n1. Ensure 'OLLAMA_ORIGINS=*' and 'OLLAMA_HOST=0.0.0.0' are active.\n2. Visit the tunnel URL directly in your browser to clear any Cloudflare warning screens.`,
      );
    }
  }

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
      <h2 style={{ margin: "0 0 10px 0", color: "#1a73e8" }}>
        Pipeline Diagnostic Hub
      </h2>
      <p>Test the connection from Cloudflare Pages to local Ollama instance.</p>

      <button
        onClick={testConnection}
        style={{
          padding: "10px 20px",
          fontSize: "16px",
          background: "#1a73e8",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        Run Pipeline Check
      </button>

      <div style={{ marginTop: "20px", fontWeight: "bold" }}>
        Status: {status}
      </div>

      <pre
        style={{
          marginTop: "15px",
          padding: "10px",
          background: "#222",
          color: "#00ff00",
          borderRadius: "4px",
          overflowX: "auto",
          minHeight: "100px",
          whiteSpace: "pre-wrap",
        }}
      >
        {log || "Console logs will appear here..."}
      </pre>
    </div>
  );
}

export default App;
