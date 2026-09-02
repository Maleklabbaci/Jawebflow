const fs = require('fs');
const content = fs.readFileSync('src/components/DashboardPlatform.tsx', 'utf-8');
const lines = content.split('\n');
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') depth++;
    if (line[j] === '}') depth--;
  }
  if (depth < 0) {
    console.log("Negative depth at line:", i + 1);
  }
}
console.log("Final depth:", depth);
