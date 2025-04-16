// seedMedia.js

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// If you're on Node < 18, uncomment these lines and install node-fetch:
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

/**
 * Fetch media data from TMDb for a given media type.
 * @param {string} mediaType - "movie" or "tv"
 * @param {number} page - The TMDb API page to fetch (default is 1)
 * @returns {Promise<Array>} - Array of media items
 */
async function fetchMediaData(mediaType, page = 1) {
  const url = `${TMDB_BASE_URL}/${mediaType}/popular?api_key=${TMDB_API_KEY}&page=${page}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`Error fetching ${mediaType} data:`, error);
    return [];
  }
}

/**
 * Insert or update media items into the Supabase "media" table.
 * The table expects the following fields: tmdb_id, type, title.
 * @param {Array} mediaItems - Array of media items fetched from TMDb
 * @param {string} mediaType - "movie" or "tv"
 */
async function insertMediaData(mediaItems, mediaType) {
  // Transform media items to match your schema.
  const formattedItems = mediaItems.map(item => ({
    tmdb_id: item.id, // Use TMDb ID
    type: mediaType,
    title: mediaType === "movie" ? item.title : item.name
  }));
  
  try {
    // Upsert data based on tmdb_id (if a record already exists, it will be updated)
    const { data, error } = await supabase
      .from("media")
      .upsert(formattedItems, { onConflict: "tmdb_id" });
      
    if (error) {
      console.error(`Error inserting ${mediaType} data:`, error);
    } else {
      console.log(`Successfully inserted ${data.length} ${mediaType} items.`);
    }
  } catch (error) {
    console.error(`Error inserting ${mediaType} data:`, error);
  }
}

async function seedMedia() {
  console.log("Seeding movies...");
  const movies = await fetchMediaData("movie", 1);
  await insertMediaData(movies, "movie");

  console.log("Seeding TV shows...");
  const tvShows = await fetchMediaData("tv", 1);
  await insertMediaData(tvShows, "tv");

  console.log("Seeding completed.");
}

seedMedia();