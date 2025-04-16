const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const admin = require("firebase-admin");

// Initialize Firebase Admin with your service account
const serviceAccount = require("./moviemagic-8521a-firebase-adminsdk-fbsvc-d84e0c9061.json"); // <-- Update this path accordingly!
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();

// Middleware setup
app.use(cors());
app.use(express.json());

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Firebase Authentication Middleware
const authenticateUser = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const idToken = authorization.split("Bearer ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Contains uid and additional info
    next();
  } catch (error) {
    console.error("Firebase token verification error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ----------------------------
// Public Endpoints
// ----------------------------

// Home
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Movie Magic server" });
});

// ----------------------------
// Protected Test Endpoint
// ----------------------------
app.get("/test", authenticateUser, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});

// ----------------------------
// Movies Endpoints
// ----------------------------

// GET /movies/search?title=xxx&page=1&per_page=20
app.get("/movies/search", async (req, res) => {
  const { title, page = 1, per_page = 20 } = req.query;
  const start = (page - 1) * per_page;
  const end = start + Number(per_page) - 1;
  try {
    let query = supabase
      .from("media")
      .select("*")
      .eq("type", "movie")
      .range(start, end);
    if (title) {
      query = query.ilike("title", `%${title}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /movies/external/:id
// Fetch up-to-date movie details from TMDb API
app.get("/movies/external/:id", async (req, res) => {
  const { id } = req.params;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  const TMDB_BASE_URL = "https://api.themoviedb.org/3";
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error fetching external movie details" });
  }
});

// ----------------------------
// TV Endpoints
// ----------------------------

// GET /tv/search?title=xxx&page=1&per_page=20
app.get("/tv/search", async (req, res) => {
  const { title, page = 1, per_page = 20 } = req.query;
  const start = (page - 1) * per_page;
  const end = start + Number(per_page) - 1;
  try {
    let query = supabase
      .from("media")
      .select("*")
      .eq("type", "tv")
      .range(start, end);
    if (title) {
      query = query.ilike("title", `%${title}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /tv/external/:id
// Fetch up-to-date TV show details from TMDb API
app.get("/tv/external/:id", async (req, res) => {
  const { id } = req.params;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;
  const TMDB_BASE_URL = "https://api.themoviedb.org/3";
  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,videos`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error fetching external TV details" });
  }
});

// ----------------------------
// Reviews Endpoints (for both movies and TV shows)
// ----------------------------

// Create a review (protected)
// POST /reviews
app.post("/reviews", authenticateUser, async (req, res) => {
  const { media_id, rating, review_text } = req.body;
  const user_id = req.user.uid;
  try {
    const { data, error } = await supabase
      .from("reviews")
      .insert([{ user_id, media_id, rating, review_text, created_at: new Date() }])
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// List reviews for a media item
// GET /media/:id/reviews
app.get("/media/:id/reviews", async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from("reviews")
      .select(`
        *,
        profiles:user_id (username)
      `)
      .eq("media_id", id);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a review (protected)
// PUT /reviews/:id
app.put("/reviews/:id", authenticateUser, async (req, res) => {
  const { id } = req.params;
  const { rating, review_text } = req.body;
  const user_id = req.user.uid;
  try {
    const { data: existingReview, error: fetchError } = await supabase
      .from("reviews")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;
    if (existingReview.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized: Not your review" });
    }
    const { data, error } = await supabase
      .from("reviews")
      .update({ rating, review_text })
      .eq("id", id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a review (protected)
// DELETE /reviews/:id
app.delete("/reviews/:id", authenticateUser, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.uid;
  try {
    const { data: existingReview, error: fetchError } = await supabase
      .from("reviews")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;
    if (existingReview.user_id !== user_id) {
      return res.status(403).json({ error: "Unauthorized: Not your review" });
    }
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------
// Profile Endpoints (protected)
// ----------------------------

// Get user profile
// GET /profile
app.get("/profile", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.user.uid)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user profile
// PUT /profile
app.put("/profile", authenticateUser, async (req, res) => {
  const { username } = req.body;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", req.user.uid)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------
// Trending Content Endpoint
// ----------------------------

// GET /trending?type=movie or type=tv
app.get("/trending", async (req, res) => {
  const { type } = req.query;
  try {
    let query = supabase
      .from("trending")
      .select(`
        *,
        media:media_id (*)
      `)
      .order("created_at", { ascending: false });
    if (type) {
      query = query.eq("trending_type", type);
    }
    const { data, error } = await query.limit(20);
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------
// Favorites Endpoints (protected)
// ----------------------------

// Add to favorites
// POST /favorites
app.post("/favorites", authenticateUser, async (req, res) => {
  const { media_id } = req.body;
  const user_id = req.user.uid;
  try {
    const { data, error } = await supabase
      .from("favorites")
      .insert([{ user_id, media_id, created_at: new Date() }])
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user's favorites
// GET /favorites
app.get("/favorites", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("favorites")
      .select(`
        *,
        media:media_id (*)
      `)
      .eq("user_id", req.user.uid)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Remove from favorites
// DELETE /favorites/:media_id
app.delete("/favorites/:media_id", authenticateUser, async (req, res) => {
  const { media_id } = req.params;
  try {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", req.user.uid)
      .eq("media_id", media_id);
    if (error) throw error;
    res.json({ message: "Favorite removed successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ----------------------------
// General Error Handling Middleware
// ----------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});