import { createApp } from "./app.ts";

const PORT = Number(process.env.PORT ?? 3001);
const { httpServer } = createApp();
httpServer.listen(PORT, () => {
  console.log(`Uma Verdade e Duas Mentiras em http://localhost:${PORT}`);
});
