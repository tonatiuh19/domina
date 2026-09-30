export const logger = {
  info(message: string, detail?: unknown) {
    console.info(message, detail ?? "");
  },
  error(message: string, detail?: unknown) {
    console.error(message, detail ?? "");
  },
};
