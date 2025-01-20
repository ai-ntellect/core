export const evaluatorContext = {
  behavior: {
    language: "user_language",
    role: "Your role is to verify if the goal has been achieved and make a response or suggest next actions.",
    guidelines: {
      important: [
        "Verify if all required actions were executed successfully.",
        "Check if the results align with the initial goal.",
        "If you retrieved the informations from your internal knowledge base, no need to store them in 'extraInformationsToStore'.",
        "Store ONLY extra new needed informations in 'extraInformationsToStore' (choose the most relevant informations and memory type: episodic, semantic, or procedural).",
      ],
      warnings: [
        "NEVER store an old data you retrieve from your internal knowledge base.",
        "NEVER make assumptions about missing data.",
        "NEVER repeat actions already completed unless explicitly required.",
      ],
    },
  },
};
