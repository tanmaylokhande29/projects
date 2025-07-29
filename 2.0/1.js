// Firebase Imports (for future use, not directly for AI question generation)
// These imports are for Firebase functionalities like authentication and database.
// They are commented out if Firebase is not strictly required for the core quiz
// but are kept here as they were in your original code.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- DOM Element References ---
// Get references to all necessary HTML elements by their IDs.
// This makes it easier to access and manipulate them in JavaScript.
const languageSelect = document.getElementById('language-select');
const startQuizBtn = document.getElementById('start-quiz-btn');
const languageSelectionSection = document.getElementById('language-selection');
const loadingIndicator = document.getElementById('loading-indicator');
const quizContainer = document.getElementById('quiz-container');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const nextButton = document.getElementById('next-button');
const scoreCard = document.getElementById('score-card');
const finalScoreSpan = document.getElementById('final-score');
const totalQuestionsSpan = document.getElementById('total-questions');
const retakeQuizBtn = document.getElementById('retake-quiz-btn');
const changeLanguageBtn = document.getElementById('change-language-btn');

// --- Global Variables for Quiz State ---
// These variables keep track of the quiz's current state.
let currentQuestions = []; // Stores the questions generated for the current quiz.
let currentQuestionIndex = 0; // Tracks which question the user is currently on.
let score = 0; // Stores the user's score.
let answeredThisQuestion = false; // Flag to prevent multiple selections for one question.

// --- Firebase Variables ---
// These variables will hold Firebase service instances once initialized.
let db; // For Firestore database operations.
let auth; // For Firebase Authentication.
let userId = null; // Stores the authenticated user's ID.


/**
 * Initializes Firebase application, authentication, and Firestore.
 * This function attempts to sign in the user anonymously or with a custom token.
 * It's important for features like saving user progress (though not implemented in this version).
 */
async function initializeFirebase() {
    try {
        // Retrieve Firebase configuration. These are expected to be global variables
        // provided by the environment (e.g., a build system like Canvas).
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

        // Check if Firebase config is available. If not, log an error and proceed
        // without Firebase to allow the quiz to still function.
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing or empty. Cannot initialize Firebase.");
            return; // Exit the function if config is missing.
        }

        // Initialize the Firebase app with the provided configuration.
        const app = initializeApp(firebaseConfig);
        // Get the Firestore service instance.
        db = getFirestore(app);
        // Get the Auth service instance.
        auth = getAuth(app);

        // Listen for changes in the user's authentication state.
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // If a user is logged in, set the userId.
                userId = user.uid;
                console.log("User authenticated:", userId);
            } else {
                // If no user is logged in, try to sign in anonymously or with a custom token.
                try {
                    // Check for a custom authentication token.
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        await signInWithCustomToken(auth, __initial_auth_token);
                    } else {
                        // If no custom token, sign in anonymously.
                        await signInAnonymously(auth);
                    }
                    // After successful sign-in, get the user ID. Fallback to randomUUID if not found.
                    userId = auth.currentUser?.uid || crypto.randomUUID();
                    console.log("Signed in anonymously or with custom token:", userId);
                } catch (error) {
                    // Log any errors during anonymous authentication.
                    console.error("Firebase Anonymous Auth Error:", error);
                    // Generate a random ID as a fallback if Firebase auth fails.
                    userId = crypto.randomUUID();
                }
            }
        });
    } catch (error) {
        // Catch any errors during the Firebase initialization process.
        console.error("Error initializing Firebase:", error);
    }
}

// --- Event Listeners ---
// Attach event listeners to buttons to trigger functions when clicked.
startQuizBtn.addEventListener('click', startQuiz); // Starts the quiz when "Start Quiz" is clicked.
nextButton.addEventListener('click', loadNextQuestion); // Loads the next question when "Next" is clicked.
retakeQuizBtn.addEventListener('click', retakeQuiz); // Restarts the quiz when "Retake Quiz" is clicked.
changeLanguageBtn.addEventListener('click', changeLanguage); // Allows changing language when "Change Language" is clicked.

/**
 * Generates quiz questions using the Gemini AI model.
 * This function sends a prompt to the AI and expects a JSON array of questions in return.
 * @param {string} language - The programming language for which to generate questions (e.g., "Python").
 * @returns {Promise<Array>} A promise that resolves to an array of question objects,
 * or an empty array if question generation fails.
 */
async function generateQuestionsWithAI(language) {
    loadingIndicator.classList.remove('hidden'); // Show the loading spinner.
    languageSelectionSection.classList.add('hidden'); // Hide the language selection section.

    let chatHistory = []; // Stores the conversation history for the AI model.
    // Define the prompt to send to the AI. It requests 5 multiple-choice questions
    // with 4 options each, and a specific JSON output format.
    const prompt = `Generate 5 multiple-choice questions about ${language} programming. Each question should have exactly 4 options, and one correct answer. Provide the output as a JSON array of objects, where each object has 'question' (string), 'options' (an array of 4 strings), and 'answer' (string, the correct option). Ensure the JSON is valid and only contains the array of questions. Do not include any other text or formatting outside the JSON.`;
    chatHistory.push({ role: "user", parts: [{ text: prompt }] }); // Add the prompt to the chat history.

    // Define the payload for the AI API request, including chat history and response schema.
    const payload = {
        contents: chatHistory,
        generationConfig: {
            responseMimeType: "application/json", // Instruct the AI to respond with JSON.
            responseSchema: { // Define the expected structure of the JSON response.
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        "question": { "type": "STRING" },
                        "options": {
                            "type": "ARRAY",
                            "items": { "type": "STRING" },
                            "minItems": 4, // Ensure exactly 4 options.
                            "maxItems": 4
                        },
                        "answer": { "type": "STRING" }
                    },
                    "required": ["question", "options", "answer"], // Specify mandatory fields.
                    "propertyOrdering": ["question", "options", "answer"] // Define property order (optional but good practice).
                }
            }
        }
    };

    // The API key for accessing the Gemini AI model. This should be provided securely in a real application.
    const apiKey = "AIzaSyAesTZl_iFRUojyLASM-WvMGq2X2qHVfJc"; // Canvas will provide this in runtime
    // The URL for the Gemini AI model's content generation endpoint.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
        // Send the POST request to the AI API.
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // Specify JSON content type.
            body: JSON.stringify(payload) // Convert the JavaScript object to a JSON string.
        });

        // Check if the HTTP response was successful.
        if (!response.ok) {
            const errorBody = await response.text(); // Get the error message from the response body.
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
        }

        // Parse the JSON response from the AI.
        const result = await response.json();

        // Validate the structure of the AI's response to ensure it contains valid questions.
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {

            const jsonString = result.candidates[0].content.parts[0].text; // Extract the JSON string.
            const parsedQuestions = JSON.parse(jsonString); // Parse the JSON string into JavaScript objects.

            // Perform detailed validation of the parsed questions.
            // Check if it's an array and if each question object has the correct properties and format.
            if (Array.isArray(parsedQuestions) && parsedQuestions.every(q =>
                typeof q.question === 'string' &&
                Array.isArray(q.options) && q.options.length === 4 && q.options.every(opt => typeof opt === 'string') &&
                typeof q.answer === 'string' && q.options.includes(q.answer) // Ensure the answer is one of the provided options.
            )) {
                return parsedQuestions; // Return the valid questions.
            } else {
                // Log and alert if the AI returned questions in an unexpected format.
                console.error("AI returned questions in an unexpected format:", parsedQuestions);
                alert("Failed to parse AI-generated questions. Please try again.");
                return []; // Return an empty array.
            }
        } else {
            // Log and alert if the overall AI response structure is unexpected.
            console.error("AI response structure is unexpected:", result);
            alert("AI did not return valid questions. Please try again.");
            return []; // Return an empty array.
        }
    } catch (error) {
        // Catch any errors during the API call or JSON parsing.
        console.error("Error generating questions with AI:", error);
        alert(`Failed to generate questions: ${error.message}. Please check your network or try again.`);
        return []; // Return an empty array on error.
    } finally {
        // This block always executes, regardless of success or failure.
        loadingIndicator.classList.add('hidden'); // Hide the loading spinner.
    }
}

/**
 * Starts the quiz.
 * This function fetches questions using the AI, then displays the first question.
 */
async function startQuiz() {
    const selectedLanguage = languageSelect.value; // Get the language selected by the user.

    // Attempt to generate questions with AI.
    currentQuestions = await generateQuestionsWithAI(selectedLanguage);

    // If no questions were generated (e.g., due to AI error), return to language selection.
    if (currentQuestions.length === 0) {
        languageSelectionSection.classList.remove('hidden'); // Show language selection.
        quizContainer.classList.add('hidden'); // Hide quiz container.
        scoreCard.classList.add('hidden'); // Hide score card.
        return; // Exit the function.
    }

    // Reset quiz state for a new quiz.
    currentQuestionIndex = 0; // Start from the first question.
    score = 0; // Reset score to zero.
    languageSelectionSection.classList.add('hidden'); // Hide language selection.
    quizContainer.classList.remove('hidden'); // Show the quiz container.
    scoreCard.classList.add('hidden'); // Ensure score card is hidden.
    loadQuestion(); // Load the first question.
}

/**
 * Loads and displays the current question and its options.
 */
function loadQuestion() {
    answeredThisQuestion = false; // Reset flag to allow selection for the new question.
    const question = currentQuestions[currentQuestionIndex]; // Get the current question object.
    questionText.textContent = question.question; // Display the question text.
    optionsContainer.innerHTML = ''; // Clear any previously displayed options.
    nextButton.classList.add('hidden'); // Hide the "Next" button until an option is selected.

    // Shuffle options to prevent users from memorizing answer positions.
    // Creates a copy of the options array and shuffles it randomly.
    const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);

    // Create a button for each shuffled option.
    shuffledOptions.forEach(option => {
        const button = document.createElement('button'); // Create a new button element.
        button.textContent = option; // Set the button's text to the option.
        button.classList.add('option-button'); // Add a class for styling.
        // Attach an event listener to call selectOption when the button is clicked.
        button.addEventListener('click', () => selectOption(button, option, question.answer));
        optionsContainer.appendChild(button); // Add the button to the options container.
    });
}

/**
 * Handles the user's option selection, checks the answer, and updates the score.
 * @param {HTMLButtonElement} selectedButton - The button element that was clicked.
 * @param {string} selectedOption - The text content of the selected option.
 * @param {string} correctAnswer - The correct answer for the current question.
 */
function selectOption(selectedButton, selectedOption, correctAnswer) {
    if (answeredThisQuestion) return; // If already answered, do nothing.

    answeredThisQuestion = true; // Mark question as answered.

    // Disable all option buttons after a selection has been made.
    for (const button of optionsContainer.children) {
        button.disabled = true;
    }

    // Check if the selected option is correct and update score/styling.
    if (selectedOption === correctAnswer) {
        selectedButton.classList.add('correct'); // Add 'correct' class for styling.
        score++; // Increment the score.
    } else {
        selectedButton.classList.add('incorrect'); // Add 'incorrect' class for styling.
        // Highlight the correct answer among the options.
        for (const button of optionsContainer.children) {
            if (button.textContent === correctAnswer) {
                button.classList.add('correct'); // Add 'correct' class to the correct answer.
            }
        }
    }
    nextButton.classList.remove('hidden'); // Show the "Next" button.
}

/**
 * Advances to the next question or shows the final result if all questions are answered.
 */
function loadNextQuestion() {
    currentQuestionIndex++; // Move to the next question's index.
    if (currentQuestionIndex < currentQuestions.length) {
        loadQuestion(); // If there are more questions, load the next one.
    } else {
        showResult(); // Otherwise, show the final quiz result.
    }
}

/**
 * Displays the final score card to the user.
 */
function showResult() {
    quizContainer.classList.add('hidden'); // Hide the quiz container.
    scoreCard.classList.remove('hidden'); // Show the score card.
    finalScoreSpan.textContent = score; // Display the user's final score.
    totalQuestionsSpan.textContent = currentQuestions.length; // Display the total number of questions.
}

/**
 * Restarts the quiz from the beginning with the same language.
 */
function retakeQuiz() {
    startQuiz(); // Call startQuiz to re-initialize and start a new quiz.
}

/**
 * Allows the user to go back to the language selection screen.
 */
function changeLanguage() {
    languageSelectionSection.classList.remove('hidden'); // Show language selection.
    quizContainer.classList.add('hidden'); // Hide quiz container.
    scoreCard.classList.add('hidden'); // Hide score card.
    loadingIndicator.classList.add('hidden'); // Ensure loading indicator is hidden.
}

// --- Initial Setup on Window Load ---
// This function runs once the entire page has loaded.
window.onload = () => {
    quizContainer.classList.add('hidden'); // Hide the quiz container initially.
    scoreCard.classList.add('hidden'); // Hide the score card initially.
    loadingIndicator.classList.add('hidden'); // Hide the loading indicator initially.
    initializeFirebase(); // Initialize Firebase services.
};