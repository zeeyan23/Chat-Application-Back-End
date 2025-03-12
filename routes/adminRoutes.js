import express from "express";
import session from "express-session";
import { fileURLToPath } from 'url';
import path from "path"
import UserModel from "../model/user.model.js";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.use(session({
    secret: "Q$r2K6W8n!jCW%Zk", // Change to a strong secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Use true if on HTTPS
  }));

  
const noCache = (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "-1");
  next();
};

function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/");
}

router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../views", "adminLogin.html"), (err) => {
      if (err) {
        console.error("Error sending file:", err);
        res.status(500).send("Internal Server Error");
      }
    });
  });

router.post("/admin_login", (req, res) => {
  console.log("Form Data Received: ", req.body); // Debug log

  const { email, password } = req.body;
  if (email === "admin@gmail.com" && password === "123456") {
    req.session.user = { email };
    return res.redirect("/admin_panel");
  }

  res.send(`
    <h3 style="color: red; text-align: center;">Invalid email or password!</h3>
    <p style="text-align: center;"><a href="/">Go back to login</a></p>
  `);
});

router.get("/admin_panel", isAuthenticated, noCache,(req, res) => {
    res.sendFile(path.join(__dirname, "../views", "adminPanel.html"));
  });
  
  router.post('/add_member', async (req, res) => {
    try {
      const { user_name, email, password } = req.body;
  
      // Validate required fields
      if (!user_name || !email || !password) {
        return res.status(400).send('All fields are required');
      }
  
      // Check if user already exists
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        return res.status(409).send('User already exists');
      }
  
      // Save new user
      const newUser = new UserModel({ user_name, email, password });
      await newUser.save();
  
      res.status(201).send('User added successfully');
    } catch (error) {
      console.error('Error saving user:', error);
      res.status(500).send('Internal server error');
    }
  });
  
  router.get('/get_users', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1; // Default page is 1
      const limit = 5; // Number of users per page
      const skip = (page - 1) * limit;
  
      const users = await UserModel.find().sort({ _id: -1 }).skip(skip).limit(limit);
      const totalUsers = await UserModel.countDocuments();
  
      res.status(200).json({
        users,
        totalPages: Math.ceil(totalUsers / limit),
        currentPage: page,
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).send('Internal server error');
    }
  });
  
  router.get('/get_user/:id', async (req, res) => {
    try {
        const user = await UserModel.findById(req.params.id);
        if (!user) return res.status(404).send('User not found');
        res.json(user);
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('Internal server error');
    }
  });
  
  // Update user by ID
  router.put('/update_user/:id', async (req, res) => {
    try {
        const { user_name, email } = req.body;
        const updatedUser = await UserModel.findByIdAndUpdate(
            req.params.id,
            { user_name, email },
            { new: true }
        );
  
        if (!updatedUser) return res.status(404).send('User not found');
        res.status(200).send('User updated successfully');
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).send('Internal server error');
    }
  });
  
  router.delete('/delete_user/:id', async (req, res) => {
    try {
        const deletedUser = await UserModel.findByIdAndDelete(req.params.id);
        
        if (!deletedUser) {
            return res.status(404).send('User not found');
        }
  
        res.status(200).send('User deleted successfully');
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).send('Internal server error');
    }
  });
  
  router.get("/logout", (req, res) => {
    req.session.destroy(() => {
      res.set("Cache-Control", "no-store");
      res.redirect("/");
    });
  });


export default router;