import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./shared/logger";

createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "api listening");
});
