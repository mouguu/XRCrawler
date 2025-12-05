import * as fs from 'node:fs';
import * as path from 'node:path';

const outputDir = path.join(process.cwd(), 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log('✅ Created output directory');
} else {
  console.log('ℹ️  Output directory already exists');
}
