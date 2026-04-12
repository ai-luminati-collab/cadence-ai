const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
       walk(dirPath, callback);
    } else {
       callback(dirPath);
    }
  });
}

walk('./src', (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
     let content = fs.readFileSync(filePath, 'utf8');

     // Replace hardcoded "text-white" EXCEPT inside button tags or specific highlighted backgrounds where white is needed
     // A regex that looks for text-white. If the word 'text-white' is used, replace with text-[var(--color-text-primary)]
     // For buttons, they often have hover effects. As an MVP, we just replace text-white with text-[var(--color-text-primary)] 
     // and manually fix any bad buttons later via Tailwind, OR we target <h1, <h2, <h3, <p
     
     content = content.replace(/text-white/g, 'text-[var(--color-text-primary)]');
     
     // We also need to fix bg-black to bg-white
     content = content.replace(/bg-black\/[0-9]+/g, 'bg-[var(--color-bg-hover)]');
     content = content.replace(/bg-black/g, 'bg-white');

     // Strip gradients and blurs 
     content = content.replace(/bg-gradient-to-[a-z]+ /g, 'bg-[var(--color-bg-surface)] ');
     // Remove from-[...] to-[...]
     content = content.replace(/from-\[.*?\] /g, '');
     content = content.replace(/to-\[.*?\] /g, '');

     // Make the bright neon text to normal slate
     content = content.replace(/text-orange-400/g, 'text-orange-600');
     content = content.replace(/text-\[#fadc8a\]/g, 'text-amber-600');
     content = content.replace(/text-\[#8afac2\]/g, 'text-emerald-600');
     content = content.replace(/text-\[#a68afa\]/g, 'text-purple-600');

     fs.writeFileSync(filePath, content);
  }
});
