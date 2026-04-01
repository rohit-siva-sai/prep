import { ExamTest } from "@/types/models";

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD_HASH =
  "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

const q = (id: string, topic: string, text: string, options: string[], answer: number) => ({
  id,
  topic,
  text,
  options,
  answer,
});

export const defaultTests: ExamTest[] = [
  {
    id: "FOUND",
    name: "Foundations Assessment",
    tagline: "Core software and web fundamentals",
    durationSec: 12 * 60,
    passPercent: 55,
    questions: [
      q("F1", "Networking", "Which protocol encrypts website traffic by default?", ["HTTP", "FTP", "HTTPS", "IMAP"], 2),
      q("F2", "Data Structures", "Which data structure follows Last-In-First-Out order?", ["Queue", "Stack", "Tree", "Graph"], 1),
      q("F3", "DBMS", "What does SQL stand for?", ["Structured Query Language", "Simple Query Logic", "Secure Queue Layer", "System Query Link"], 0),
      q("F4", "Programming", "Which Java keyword creates a subclass from a parent class?", ["extends", "implements", "inherits", "super"], 0),
      q("F5", "Algorithms", "Big-O for binary search on sorted data is", ["O(n)", "O(log n)", "O(n log n)", "O(1)"], 1),
      q("F6", "Web", "Which HTML tag is used for the largest heading?", ["<head>", "<h6>", "<h1>", "<header>"], 2),
      q("F7", "DBMS", "Which SQL clause filters rows before grouping?", ["HAVING", "ORDER BY", "GROUP BY", "WHERE"], 3),
      q("F8", "DBMS", "Which of these is a NoSQL database?", ["MySQL", "PostgreSQL", "MongoDB", "Oracle"], 2),
      q("F9", "Web", "In CSS, which property controls text color?", ["font-color", "text-color", "color", "foreground"], 2),
      q("F10", "Networking", "Which HTTP status means Not Found?", ["200", "302", "401", "404"], 3),
      q("F11", "Tools", "Which command in Git uploads local commits to remote?", ["git clone", "git pull", "git push", "git merge"], 2),
      q("F12", "Programming", "Which one is a strongly typed language?", ["Java", "HTML", "CSS", "SQL"], 0),
    ],
  },
  {
    id: "AI",
    name: "AI Systems Readiness",
    tagline: "Applied ML, evaluation and deployment concepts",
    durationSec: 10 * 60,
    passPercent: 60,
    questions: [
      q("A1", "NLP", "Which model architecture powers most modern LLM chat systems?", ["CNN", "Transformer", "RNN", "SVM"], 1),
      q("A2", "Machine Learning", "Precision measures", ["Correct positives among predicted positives", "Correct positives among all actual positives", "Overall correctness", "Training speed"], 0),
      q("A3", "Machine Learning", "Overfitting means", ["Model performs well on unseen data", "Model memorizes training data and generalizes poorly", "Model uses too little data", "Model has low variance"], 1),
      q("A4", "Machine Learning", "Which task is supervised learning?", ["Clustering customers", "Dimensionality reduction", "Spam classification", "Topic modeling"], 2),
      q("A5", "Machine Learning", "Gradient descent updates parameters using", ["Random guessing", "Loss gradients", "Manual tuning", "Hash maps"], 1),
      q("A6", "Machine Learning", "A confusion matrix is used for", ["Database joins", "Classification evaluation", "Network routing", "Code linting"], 1),
      q("A7", "Machine Learning", "Which metric is better for imbalanced binary classes?", ["Accuracy only", "F1 score", "Epoch count", "Latency"], 1),
      q("A8", "NLP", "Tokenization in NLP is", ["Encrypting text", "Breaking text into units", "Compressing images", "Balancing labels"], 1),
      q("A9", "Machine Learning", "ReLU is", ["A loss function", "An optimizer", "An activation function", "A tokenizer"], 2),
      q("A10", "Machine Learning", "Train/validation split helps", ["Detect generalization", "Speed up hardware", "Avoid using labels", "Remove features"], 0),
    ],
  },
  {
    id: "CYBER",
    name: "Cyber Operations Drill",
    tagline: "Security, authentication and secure web operations",
    durationSec: 9 * 60,
    passPercent: 65,
    questions: [
      q("C1", "Security", "Which attack injects malicious SQL statements?", ["DDoS", "XSS", "SQL Injection", "CSRF"], 2),
      q("C2", "Security", "MFA stands for", ["Managed Firewall Access", "Multi-Factor Authentication", "Master File Allocation", "Main Function API"], 1),
      q("C3", "Security", "Principle of least privilege means", ["Give all users admin", "Grant minimum required access", "Share credentials", "Disable logging"], 1),
      q("C4", "Security", "Which header reduces XSS risk in browsers?", ["Content-Security-Policy", "Cache-Control", "ETag", "Accept-Language"], 0),
      q("C5", "Security", "Brute force protection usually includes", ["Unlimited retries", "Rate limiting and lockout", "Plain text passwords", "Open ports"], 1),
      q("C6", "Security", "Which one is symmetric encryption?", ["RSA", "ECC", "AES", "DSA"], 2),
      q("C7", "Security", "Phishing primarily targets", ["Hardware heat", "Human trust", "Compiler speed", "DNS TTL"], 1),
      q("C8", "Security", "Which log is key for incident response?", ["Authentication logs", "Font logs", "Theme logs", "Cache logos"], 0),
      q("C9", "Security", "HTTPS certificate validation helps prevent", ["MITM attacks", "Memory leaks", "Race conditions", "Deadlocks"], 0),
      q("C10", "Security", "A secure password should be", ["Short and reused", "Long and unique", "Only numeric", "Stored in plain text"], 1),
    ],
  },
];
