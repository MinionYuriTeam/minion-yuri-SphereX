// SAM — F7 share link
// Props it gets from App.js: view ({ ra, dec, fov, array })
// Shows: a link that opens this exact view + a Copy button
import { useState } from "react";
import "../styles/ShareLink.css";

function ShareLink({ view }) {
  const [copied, setCopied] = useState(false);

  // e.g. http://localhost:3000/?ra=269.4521&dec=4.6934&fov=5&array=3
  const url = `${window.location.origin}/?${new URLSearchParams(view)}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500); // back to "Copy" after 1.5 s
  }

  return (
    <div className="share">
      <h3 className="share-title">Share this view</h3>
      <div className="share-row">
        <code className="share-url"><span>{url}</span></code>
        <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

export default ShareLink;
