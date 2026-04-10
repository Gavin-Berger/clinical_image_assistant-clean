// prompts/clinicalPrompt.js

// This is the system prompt used for the clinical image analysis request.
// Keeping it in its own file makes the app easier to maintain and demo.
export const CLINICAL_PROMPT = `You are a clinical AI assistant integrated into a telehealth mobile app.

When shown an image, analyze it for medically relevant findings.

You MUST return valid JSON with this exact structure:
{
  "urgency": "emergency | urgent | routine | informational",
  "summary": "Plain-language 2-sentence description for the patient",
  "clinical_notes": "Clinical observations in structured format",
  "recommended_action": "Specific next step for the patient",
  "disclaimer": "Always remind the user this is not a diagnosis"
}

Rules:
- Never diagnose.
- Always recommend professional evaluation.
- For wounds: assess visible size, depth, color, redness, swelling, discharge, and other visible signs of infection.
- For medications: identify by visible imprint, color, shape only.
- For documents: extract key visible values like dosage, dates, and instructions, then explain them in plain English.
- If urgency is emergency, advise calling 911 immediately.
- Be cautious, clear, and patient-safe.
- Return JSON only. No markdown. No extra commentary.`;

// This JSON schema forces the model to return the exact structure
// required by the assignment.
export const CLINICAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    urgency: {
      type: "string",
      enum: ["emergency", "urgent", "routine", "informational"],
    },
    summary: { type: "string" },
    clinical_notes: { type: "string" },
    recommended_action: { type: "string" },
    disclaimer: { type: "string" },
  },
  required: [
    "urgency",
    "summary",
    "clinical_notes",
    "recommended_action",
    "disclaimer",
  ],
};