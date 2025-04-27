// app/api/compare/route.js
import { GoogleGenAI } from "@google/genai";
import fs from "fs"; // Still needed for initial path check if desired
import { NextResponse } from "next/server";
import path from "path";

// --- Configuration ---
const CONSERVATIVE_PDF_PATH = path.join(
    process.cwd(),
    "data",
    "conservative_plan.pdf"
);
const LIBERAL_PDF_PATH = path.join(process.cwd(), "data", "liberal_plan.pdf");
const API_KEY = process.env.GOOGLE_API_KEY;
// Ensure the model supports File API input for PDFs
const MODEL_NAME = "gemini-2.5-flash-preview-04-17"; // Or gemini-1.5-pro-latest

// --- Helper Function to generate perspective using File API ---
async function getPartyPerspectiveWithFile(
    ai,
    partyName,
    fileUploadResult,
    userQuery
) {
    // Check if upload was successful
    if (!fileUploadResult || !fileUploadResult.uri) {
        return `Error: Could not process the document upload for the ${partyName}.`;
    }
    if (!userQuery || userQuery.trim() === "") {
        return `Please provide a specific topic or question.`;
    }

    // Construct the prompt text part
    const promptText = `
        Based *only* on the provided PDF document for the ${partyName}, please summarize their perspective, policies, or commitments related to the user's query: "${userQuery}".

        Focus strictly on information present *within the document*. If the document does not contain relevant information on this specific topic, clearly state that. Do not invent information or use external knowledge. Provide a concise summary.
    `;

    // Construct the file data part
    const filePart = {
        fileData: {
            mimeType: fileUploadResult.mimeType,
            fileUri: fileUploadResult.uri,
        },
    };

    try {
        console.log(
            `Requesting summary for ${partyName} about "${userQuery.substring(
                0,
                30
            )}..." using file: ${fileUploadResult.name}`
        );
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            // Contents array includes the text prompt and the file reference
            contents: [
                { role: "user", parts: [{ text: userQuery }, filePart] },
            ],
            config: {
                systemInstruction: `Based *only* on the provided PDF document for the ${partyName}, please summarize their perspective, policies, or commitments related to the user's query.
You must start your response with "The ${partyName}'s platform for 2025 includes...". You can include point form bullet points if needed.
Focus strictly on information present *within the document*. If the document does not contain relevant information on this specific topic, clearly state that. Do not invent information or use external knowledge. Provide a concise and exhaustive summary.`,
            },
            // Optional: Add generation config if needed
            // generationConfig: { temperature: 0.7 },
        });

        const text =
            result?.text ?? `No response text found from AI for ${partyName}.`;
        console.log(
            `AI Response for ${partyName} (${userQuery.substring(0, 20)}...):`,
            text.substring(0, 100) + "..."
        );
        return text;
    } catch (error) {
        console.error(
            `Error generating content for ${partyName} using File API:`,
            error
        );
        // Provide more specific error feedback based on common issues
        if (
            error.message?.includes("API key not valid") ||
            error.status === "UNAUTHENTICATED"
        ) {
            return `Error: Invalid Google API Key.`;
        }
        if (
            error.message?.includes("permission") ||
            error.status === "PERMISSION_DENIED"
        ) {
            return `Error: Permission denied for model '${MODEL_NAME}' or File API.`;
        }
        if (
            error.message?.includes("model") &&
            error.message?.includes("not found")
        ) {
            return `Error: Model '${MODEL_NAME}' not found or not available.`;
        }
        if (error.status === "RESOURCE_EXHAUSTED") {
            return `Error: API Quota exceeded.`;
        }
        if (error.status === "INVALID_ARGUMENT") {
            // Could be various issues: unsupported mime type, bad file URI, prompt issues
            console.error("Invalid Argument details:", error.message); // Log the specific message
            return `Error: Invalid argument provided to the AI model for ${partyName}. Check logs for details. (Might be related to the file or prompt).`;
        }
        if (error.message?.includes("file processing")) {
            // Specific errors related to file processing
            return `Error: The AI model encountered an issue processing the ${partyName} document. Details: ${error.message}`;
        }
        return `An error occurred while getting the ${partyName} perspective via File API. Details: ${
            error.message || "Unknown AI Error"
        }`;
    }
}

// --- API Handler for POST requests using File API ---
export async function POST(request) {
    if (!API_KEY) {
        console.error("API route error: GOOGLE_API_KEY is missing.");
        return NextResponse.json(
            { error: "Server configuration error: API key missing." },
            { status: 500 }
        );
    }

    let query;
    try {
        const body = await request.json();
        query = body.query;
        if (!query || typeof query !== "string" || query.trim() === "") {
            return NextResponse.json(
                { error: "Query parameter is missing or empty." },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error("Error parsing request body:", error);
        return NextResponse.json(
            {
                error: 'Invalid request body. Expected JSON with a "query" field.',
            },
            { status: 400 }
        );
    }

    // Optional: Check if PDF files physically exist before trying to upload
    if (
        !fs.existsSync(CONSERVATIVE_PDF_PATH) ||
        !fs.existsSync(LIBERAL_PDF_PATH)
    ) {
        console.error(
            `One or both PDF files not found at expected paths: ${CONSERVATIVE_PDF_PATH}, ${LIBERAL_PDF_PATH}`
        );
        return NextResponse.json(
            {
                error: "Server configuration error: Party document(s) not found.",
            },
            { status: 500 }
        );
    }

    let conservativeUploadResult = null;
    let liberalUploadResult = null;
    const ai = new GoogleGenAI({ apiKey: API_KEY }); // Initialize AI client once

    try {
        console.log("Attempting to upload PDF files...");
        // 1. Upload the PDFs concurrently
        [conservativeUploadResult, liberalUploadResult] = await Promise.all([
            ai.files.upload({ file: CONSERVATIVE_PDF_PATH }).catch((err) => {
                console.error(
                    `Error uploading Conservative PDF (${CONSERVATIVE_PDF_PATH}):`,
                    err
                );
                return null; // Return null on failure
            }),
            ai.files.upload({ file: LIBERAL_PDF_PATH }).catch((err) => {
                console.error(
                    `Error uploading Liberal PDF (${LIBERAL_PDF_PATH}):`,
                    err
                );
                return null; // Return null on failure
            }),
        ]);

        // Handle upload failures - if either failed, we stop and report.
        if (!conservativeUploadResult || !liberalUploadResult) {
            console.error("One or both file uploads failed.");
            // Attempt cleanup of any file that *did* upload successfully before exiting
            if (conservativeUploadResult)
                await ai.files
                    .delete(conservativeUploadResult.name)
                    .catch((e) =>
                        console.error(
                            "Cleanup delete failed (Conservative):",
                            e
                        )
                    );
            if (liberalUploadResult)
                await ai.files
                    .delete(liberalUploadResult.name)
                    .catch((e) =>
                        console.error("Cleanup delete failed (Liberal):", e)
                    );
            return NextResponse.json(
                {
                    error: "Failed to upload one or both party documents to AI service.",
                },
                { status: 500 }
            );
        }

        console.log(
            `Files uploaded successfully: ${conservativeUploadResult.name}, ${liberalUploadResult.name}`
        );

        // 2. Get perspectives concurrently using the uploaded file results
        const [conservativePerspective, liberalPerspective] = await Promise.all(
            [
                getPartyPerspectiveWithFile(
                    ai,
                    "Conservative Party",
                    conservativeUploadResult,
                    query
                ),
                getPartyPerspectiveWithFile(
                    ai,
                    "Liberal Party",
                    liberalUploadResult,
                    query
                ),
            ]
        );

        console.log("Sending perspectives:", {
            conservative: conservativePerspective.substring(0, 50) + "...",
            liberal: liberalPerspective.substring(0, 50) + "...",
        });

        // 3. Return the successful response
        return NextResponse.json(
            {
                conservative: conservativePerspective,
                liberal: liberalPerspective,
            },
            { status: 200 }
        );
    } catch (error) {
        // Catch broader errors (e.g., AI client init issues, unexpected Promise.all failures)
        console.error("API handler error (File API approach):", error);
        if (error.message?.includes("API key not valid")) {
            return NextResponse.json(
                {
                    error: "Server configuration error: Invalid Google API Key.",
                },
                { status: 500 }
            );
        }
        return NextResponse.json(
            {
                error: "An unexpected error occurred on the server during processing.",
            },
            { status: 500 }
        );
    } finally {
        // 4. (Important!) Attempt to delete the uploaded files regardless of success/failure after generation attempt
        console.log(
            "Attempting cleanup: Deleting uploaded files if they exist..."
        );

        // --- Updated Delete Logic ---
        if (conservativeUploadResult?.name) {
            try {
                console.log(
                    `Attempting delete for Conservative file: ${conservativeUploadResult.name}`
                );
                await ai.files.delete(conservativeUploadResult.name);
                console.log(
                    `Successfully deleted file: ${conservativeUploadResult.name}`
                );
            } catch (deleteError) {
                // Log the specific error from this delete attempt
                console.error(
                    `Error deleting file ${conservativeUploadResult.name}:`,
                    deleteError?.message || deleteError
                );
                // You could log the full error object for more details if needed:
                // console.error("Full Conservative delete error object:", deleteError);
            }
        } else {
            console.log(
                "Skipping delete for Conservative file (upload result not found)."
            );
        }

        if (liberalUploadResult?.name) {
            try {
                console.log(
                    `Attempting delete for Liberal file: ${liberalUploadResult.name}`
                );
                await ai.files.delete(liberalUploadResult.name);
                console.log(
                    `Successfully deleted file: ${liberalUploadResult.name}`
                );
            } catch (deleteError) {
                console.error(
                    `Error deleting file ${liberalUploadResult.name}:`,
                    deleteError?.message || deleteError
                );
                // console.error("Full Liberal delete error object:", deleteError);
            }
        } else {
            console.log(
                "Skipping delete for Liberal file (upload result not found)."
            );
        }
    }
}

// --- GET Handler (remains the same) ---
export async function GET() {
    return NextResponse.json({
        message:
            'API route is active. Use POST requests with a "query" in the body. Uses File API for PDFs.',
    });
}
