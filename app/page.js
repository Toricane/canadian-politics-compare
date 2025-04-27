// app/page.js
"use client"; // <--- Mark as a Client Component

import { useState } from "react";
// Head component is not used directly here, metadata is exported from page/layout
import styles from "../styles/Home.module.css"; // Adjust path if needed

export default function Home() {
    const [query, setQuery] = useState("");
    const [conservativePerspective, setConservativePerspective] = useState(
        "The Conservative perspective will appear here..."
    );
    const [liberalPerspective, setLiberalPerspective] = useState(
        "The Liberal perspective will appear here..."
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!query.trim()) {
            setError("Please enter a topic or question.");
            return;
        }

        setIsLoading(true);
        setError("");
        setConservativePerspective("Loading perspective...");
        setLiberalPerspective("Loading perspective...");

        try {
            // Fetch points to the API route defined in app/api/compare/route.js
            const response = await fetch("/api/compare", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        `API request failed with status ${response.status}`
                );
            }

            setConservativePerspective(
                data.conservative ||
                    "No specific information found or an error occurred."
            );
            setLiberalPerspective(
                data.liberal ||
                    "No specific information found or an error occurred."
            );
        } catch (err) {
            console.error("Fetch error:", err);
            setError(
                err.message ||
                    "Failed to fetch perspectives. Check browser console and server logs."
            );
            // Reset perspectives on error
            setConservativePerspective("Error loading perspective.");
            setLiberalPerspective("Error loading perspective.");
        } finally {
            setIsLoading(false);
        }
    };

    // The JSX structure remains largely the same as the 'pages' version
    return (
        // Removed container div, assuming layout provides main structure
        // Add a wrapper if layout doesn't provide enough structure/centering
        <main className={styles.main}>
            <h1 className={styles.title}>Canadian Political Perspectives</h1>
            <p className={styles.description}>
                Compare policy viewpoints across Canada's major political
                parties
            </p>

            {/* Comparison Boxes */}
            <div className={styles.comparisonGrid}>
                <div className={styles.partyColumn}>
                    <h2 className={styles.partyTitleConservative}>
                        CONSERVATIVE PARTY
                    </h2>
                    <div
                        className={`${styles.perspectiveBox} ${styles.conservativeBox}`}
                    >
                        {/* Render newlines correctly from the LLM response */}
                        <p style={{ whiteSpace: "pre-wrap" }}>
                            {conservativePerspective}
                        </p>
                    </div>
                </div>
                <div className={styles.partyColumn}>
                    <h2 className={styles.partyTitleLiberal}>LIBERAL PARTY</h2>
                    <div
                        className={`${styles.perspectiveBox} ${styles.liberalBox}`}
                    >
                        <p style={{ whiteSpace: "pre-wrap" }}>
                            {liberalPerspective}
                        </p>
                    </div>
                </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className={styles.inputForm}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask about Canadian political issues..."
                    className={styles.inputField}
                    disabled={isLoading}
                />
                <button
                    type="submit"
                    className={styles.submitButton}
                    disabled={isLoading}
                >
                    {isLoading ? "Asking..." : "Ask"}
                </button>
            </form>

            {error && <p className={styles.errorText}>{error}</p>}

            {/* Footer - Consider moving to layout.js if it's global */}
            <footer className={styles.footer}>
                <p>
                    Built by Prajwal Prashanth, inspired by Krishiv&apos;s{" "}
                    <a href="https://nextvoters.com/" target="_blank">
                        {" "}
                        nextvoters.com
                    </a>
                </p>
            </footer>
        </main>
    );
}
