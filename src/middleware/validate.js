import { sendError } from "../utils/helpers.js";

export function validate(schema, property = "body") {
  return (req, res, next) => {
    try {
      const data = schema.parse(req[property]);
      req[property] = data;
      next();
    } catch (error) {
      const message = error.errors?.map((e) => e.message).join(", ") || "Validation failed";
      return sendError(res, "VALIDATION_ERROR", message, 400);
    }
  };
}

export default validate;
