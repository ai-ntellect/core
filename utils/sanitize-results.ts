/**
 * Utility class to sanitize JSON results for evaluation
 */
export class ResultSanitizer {
  /**
   * Sanitizes JSON results by removing special characters and formatting
   * @param results - The results to sanitize
   * @returns Sanitized string
   */
  static sanitize(results: any): string {
    if (!results) return "";

    try {
      const jsonString = JSON.stringify(results);
      return (
        jsonString
          // Basic cleanup
          .replace(/\\n/g, " ") // Remove newlines
          .replace(/\s+/g, " ") // Remove extra spaces
          .replace(/\\"/g, '"') // Fix escaped quotes
          .replace(/\\+/g, "") // Remove extra backslashes

          // Remove unnecessary quotes around objects and arrays
          .replace(/"\[/g, "[") // Remove quotes around arrays start
          .replace(/\]"/g, "]") // Remove quotes around arrays end
          .replace(/"{/g, "{") // Remove quotes around objects start
          .replace(/}"/g, "}") // Remove quotes around objects end

          // Clean up numbers and values
          .replace(/"(\d+\.?\d*)"/g, "$1") // Remove quotes around numbers
          .replace(/:\s*"(true|false|null)"/g, ": $1") // Remove quotes around booleans and null

          // Clean up URLs and content
          .replace(
            /(?<=content":")([^"]+)(?=")/g,
            (match) => match.trim().replace(/\s+/g, " ") // Clean content spacing
          )
          .replace(
            /(?<=link":")([^"]+)(?=")/g,
            (match) => match.replace(/&amp;/g, "&") // Fix URL encodings
          )

          // Final cleanup
          .replace(/,\s*([}\]])/g, "$1") // Remove trailing commas
          .replace(/:\s+/g, ":") // Remove spaces after colons
          .replace(/,\s+/g, ",") // Remove spaces after commas
          .trim()
      ); // Remove leading/trailing whitespace
    } catch (error) {
      console.error("Error sanitizing results:", error);
      return String(results);
    }
  }

  /**
   * Formats numbers to a consistent format
   * @param value - The number to format
   * @returns Formatted number string
   */
  private static formatNumber(value: number): string {
    return value.toLocaleString("en-US", {
      maximumFractionDigits: 2,
      useGrouping: false,
    });
  }
}
