import { spawnStream } from './src/utils/youtube-search.js';
import { initPlayDL } from './src/utils/playdl-init.js';

async function run() {
  await initPlayDL();
  try {
    const stream = await spawnStream('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    console.log("Stream acquired!");
  } catch(e: any) {
    console.error("Stream failed:", e.message);
  }
}
run();
