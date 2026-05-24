const morgan = require("morgan");

const loggerMiddleware = morgan(
  ":date[iso] :method :url :status :response-time ms - :res[content-length]"
);

module.exports = { loggerMiddleware };
