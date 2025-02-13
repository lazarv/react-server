export const remoteStyle = `.react-server-global-error * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  .react-server-global-error {
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.5;
    padding: 1rem;
    background: #fff !important;
    display: block;
  }
  
  .react-server-global-error h1 {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: #e11d48;
  }
  
  .react-server-global-error pre {
    margin: 1rem 0;
    padding: 1rem;
    background: #f1f5f9;
    color: #374151;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    width: 100%;
    overflow: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }`;

export const style = `${remoteStyle}
  
  .react-server-global-error button {
    padding: 0.5rem 1rem;
    background: #0ea5e9;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  
  .react-server-global-error button:hover {
    background: #0284c7;
  }`;
