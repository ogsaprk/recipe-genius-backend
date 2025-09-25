const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '30c5bdb4b8f0c58a4a52e1363da47212';

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB (we'll use MongoDB Atlas free tier)
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://papitainerixix_db_user:dQx7PpWRaPKcbp51@cluster1.mqsijhf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  subscriptionTier: { type: String, default: 'free' },
  recipesGenerated: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Recipe Schema
const recipeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: String,
  ingredients: [String],
  instructions: [String],
  dietaryTags: [String],
  cookingTime: Number,
  servings: Number,
  createdAt: { type: Date, default: Date.now }
});

const Recipe = mongoose.model('Recipe', recipeSchema);

// Auth Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// Routes

// 1. User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      subscriptionTier: 'free',
      recipesGenerated: 0
    });

    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        recipesGenerated: user.recipesGenerated
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 2. User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        recipesGenerated: user.recipesGenerated
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// 3. Generate Recipe (with usage limits)
app.post('/api/recipes/generate', authenticateToken, async (req, res) => {
  try {
    const { ingredients, dietaryPreferences, cookingTime, servings } = req.body;
    const user = req.user;

    // Check usage limits for free tier
    if (user.subscriptionTier === 'free' && user.recipesGenerated >= 5) {
      return res.json({
        success: false,
        error: 'Free tier limit reached (5 recipes/month). Upgrade to premium for unlimited recipes.'
      });
    }

    // Generate recipe using AI (mock for now - we'll integrate real AI later)
    const recipe = await generateAIRecipe({
      ingredients,
      dietaryPreferences,
      cookingTime,
      servings
    });

    // Save recipe to user's history
    const savedRecipe = new Recipe({
      userId: user._id,
      title: recipe.title,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      dietaryTags: recipe.dietaryTags,
      cookingTime: recipe.cookingTime,
      servings: recipe.servings
    });

    await savedRecipe.save();

    // Update user's recipe count
    user.recipesGenerated += 1;
    await user.save();

    res.json({
      success: true,
      recipe: recipe,
      usage: {
        generatedThisMonth: user.recipesGenerated,
        limit: user.subscriptionTier === 'free' ? 5 : 'unlimited'
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Recipe generation failed' });
  }
});

// 4. Get User's Recipe History
app.get('/api/recipes/history', authenticateToken, async (req, res) => {
  try {
    const recipes = await Recipe.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, recipes });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recipes' });
  }
});

// Mock AI Recipe Generation (Replace with real AI later)
async function generateAIRecipe(params) {
  // This is where you'll integrate Google AI or other AI services
  return {
    title: `AI Generated Recipe with ${params.ingredients.join(', ')}`,
    ingredients: params.ingredients.map(ing => `${ing} - 2 cups`),
    instructions: [
      "1. Prepare all your ingredients",
      "2. Follow the cooking process",
      "3. Season to taste",
      "4. Serve and enjoy your delicious meal!"
    ],
    dietaryTags: params.dietaryPreferences || ['balanced'],
    cookingTime: params.cookingTime || 30,
    servings: params.servings || 4
  };
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'Recipe SaaS Backend is running!',
    version: '1.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`Recipe SaaS Backend running on port ${PORT}`);
});
