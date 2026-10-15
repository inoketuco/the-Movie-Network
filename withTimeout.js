// Firestore writes wait for a server acknowledgement and never reject while the
// backend is unreachable, which would leave loading states stuck forever.
export const withTimeout = (promise, milliseconds, message) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = 'timeout';
      reject(error);
    }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};
