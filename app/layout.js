// app/layout.js
import "../styles/globals.css"; // Create this file if you need global styles
import styles from "../styles/Home.module.css"; // Import styles used by layout

// Export metadata for the page (replaces <Head>)
export const metadata = {
    title: "Canadian Political Perspectives",
    description:
        "Compare policy viewpoints across Canada's major political parties",
    icons: {
        icon: "/favicon.ico", // Make sure favicon.ico is in the public folder
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                {/* You can add global headers, footers, or wrappers here */}
                {/* The styles.container provides the centering */}
                <div className={styles.container}>
                    {children} {/* This renders the content of app/page.js */}
                </div>
            </body>
        </html>
    );
}
