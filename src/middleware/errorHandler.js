import logger from "../utils/logger.js";

export function errorHandler(err, req, res, next) {
  logger.error(err.stack || err.message);

  if (err.name === "ZodError") {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input data",
        details: err.errors,
      },
    });
  }

  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: { code: "FILE_TOO_LARGE", message: "File exceeds 15MB limit" },
      });
    }
    return res.status(400).json({
      success: false,
      error: { code: "UPLOAD_FAILED", message: err.message },
    });
  }

  return res.status(500).json({
    success: false,
    error: { code: "SERVER_ERROR", message: "Something went wrong" },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
}

export default errorHandler;
