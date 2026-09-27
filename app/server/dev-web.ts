// Web-only dev server for UI slices: `bun run dev:web`, then open http://localhost:7778/?fixture
import index from "../web/index.html";
const server = Bun.serve({ port: Number(process.env.PORT ?? 7778), development: true, routes: { "/": index } });
console.log(`web dev on http://localhost:${server.port}/?fixture`);
