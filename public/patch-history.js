// Geçmiş tablosunun container'ını kaydırılabilir yap
const style = document.createElement('style');
style.innerHTML = `
  .history-table-container {
    max-height: 480px;
    overflow-y: auto;
  }
  .history-table-container::-webkit-scrollbar {
    width: 6px;
  }
  .history-table-container::-webkit-scrollbar-thumb {
    background: #334155;
    border-radius: 4px;
  }
`;
document.head.appendChild(style);
