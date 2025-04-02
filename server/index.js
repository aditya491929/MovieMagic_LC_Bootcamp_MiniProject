const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error) throw error;

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Auth routes
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    res.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post("/auth/signup", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    res.json({
      user: data.user,
      session: data.session,
      message: "Signup successful. Please check your email for verification.",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Protected route example
app.get("/test", authenticateUser, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});

// Public routes
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Movie Magic server" });
});

// Media Routes
app.get("/media/search", async (req, res) => {
  const { title, type, page = 1, per_page = 20 } = req.query;
  const start = (page - 1) * per_page;
  const end = start + per_page - 1;

  try {
    let query = supabase.from("media").select("*").range(start, end);

    if (title) {
      query = query.ilike("title", `%${title}%`);
    }
    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Reviews Routes
app.post("/reviews", authenticateUser, async (req, res) => {
  const { media_id, rating, review_text } = req.body;
  const user_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from("reviews")
      .insert([
        {
          user_id,
          media_id,
          rating,
          review_text,
          created_at: new Date(),
        },
      ])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/media/:id/reviews", async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("reviews")
      .select(
        `
        *,
        profiles:user_id (username)
      `
      )
      .eq("media_id", id);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Profile Routes
app.get("/profile", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/profile", authenticateUser, async (req, res) => {
  const { username } = req.body;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({ username })
      .eq("id", req.user.id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Trending Content Routes
app.get("/trending", async (req, res) => {
  const { type } = req.query;

  try {
    let query = supabase
      .from("trending")
      .select(
        `
        *,
        media:media_id (*)
      `
      )
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

// Favorites Routes
app.post("/favorites", authenticateUser, async (req, res) => {
  const { media_id } = req.body;
  const user_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from("favorites")
      .insert([
        {
          user_id,
          media_id,
          created_at: new Date(),
        },
      ])
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/favorites", authenticateUser, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("favorites")
      .select(
        `
        *,
        media:media_id (*)
      `
      )
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/favorites/:media_id", authenticateUser, async (req, res) => {
  const { media_id } = req.params;

  try {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", req.user.id)
      .eq("media_id", media_id);

    if (error) throw error;
    res.json({ message: "Favorite removed successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
