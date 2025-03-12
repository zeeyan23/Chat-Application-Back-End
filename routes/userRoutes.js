import e from "express";
import jsonwebtoken from "jsonwebtoken";

import UserModel from "../model/user.model.js";
import GroupModel from "../model/group.model.js";
import multer from "multer";

const router = e.Router();

const createToken = (userId) =>{
    const payload={
        userId:userId
    }

    const token = jsonwebtoken.sign(payload, "Q$r2K6W8n!jCW%Zk");

    return token;
}

//End point to save message
const storage = multer.diskStorage({
    destination: function (req, file, cb){
        cb(null,'files/')
    },
    filename: function (req, file, cb){
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null,uniqueSuffix + '-' + file.originalname);
    }
})
// const upload = multer ({storage :storage});
const upload = multer ({storage :storage,
    limits: { fileSize: 100 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|mp4|mov|pdf|docx|pptx|xlsx|zip|m4a|mp3|wav|3gp/; 
        const extName = fileTypes.test(file.mimetype);
        if (extName) {
            cb(null, true);
        } else {
            cb(new Error('Only images and videos are allowed!'), false);
        }
    },
});

router.post('/user_login', async (req, res) => {
  const { email, password, expoPushToken } = req.body;

  if (!email || !password) {
      return res.status(400).json({ message: "Please enter both email and password" });
  }

  try {
      // Normalize the email: trim spaces and convert to lowercase
      const normalizedEmail = email.trim().toLowerCase();

      // Find user by normalized email
      const user = await UserModel.findOne({ email: normalizedEmail });

      if (!user) {
          return res.status(404).json({ message: "User Not Found" });
      }

      if (user.password !== password) {
          return res.status(401).json({ message: "Invalid Password" });
      }

      // Update expoPushToken if provided
      if (expoPushToken) {
          user.expoPushToken = expoPushToken;
          await user.save();
      }

      // Create token
      const token = createToken(user.id);

      const friendsList = user.friends?.[0]?.friendsList || [];
      const validFriends = await UserModel.find({ _id: { $in: friendsList } }).select('_id');
      const hasValidFriends = validFriends.length > 0;

      // Check groups array for valid group IDs
      const validGroups = await GroupModel.find({ _id: { $in: user.groups } }).select('_id');
      const hasValidGroups = validGroups.length > 0;

      // Include checks in response
      res.status(200).json({
          token,
          userId: user.id,
          hasValidFriends,
          hasValidGroups,
      });
  } catch (error) {
      console.error("Error in finding the user or validating data", error);
      res.status(500).json({ message: "Error in finding the user or validating data" });
  }
});

router.get('/get-user-id-from-token', async (req, res) => {
  try {
      const token = req.headers.authorization?.split(' ')[1];  // Extract the token
      if (!token) {
          return res.status(400).json({ message: "Token is required" });
      }

      const decodedToken = jsonwebtoken.verify(token, 'Q$r2K6W8n!jCW%Zk'); // Replace with your secret key
      const userId = decodedToken.userId;

      return res.status(200).json({ userId });
  } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error decoding token" });
  }
});

router.get("/all_users/:userId", (req, res) => {
    const loggedInUserId = req.params.userId;
  
    UserModel.find({ _id: { $ne: loggedInUserId } })
      .then((users) => {
        res.status(200).json(users);
      })
      .catch((err) => {
        console.log("Error retrieving users", err);
        res.status(500).json({ message: "Error retrieving users" });
      });
  });

  router.get("/user-data/:userId", async(req, res) => {
    const loggedInUserId = req.params.userId;
  
    try {
      // Fetch user data from the database
      const user = await UserModel.findById(loggedInUserId).select("user_name email password image");
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // Send the user data as the response
      res.status(200).json(user);
    } catch (error) {
      console.error("Error fetching user data:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.patch("/users/update", async (req, res) => {
    const { userId, user_name, email,password } = req.body;
  
    try {
      // Find user by ID and update the specified fields
      const updateFields = {};
      if (user_name) updateFields.user_name = user_name;
      if (email) updateFields.email = email;
      if (password) updateFields.password = password;
  
      const updatedUser = await UserModel.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true } // Return the updated document
      );
  
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
  
      res.status(200).json({
        message: "User updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Internal Server Error", error });
    }
  });

  router.patch('/update_password' ,async(req, res)=>{
    try {
      const { email, password } = req.body;
  
      const user = await UserModel.findOne({ email: email.toLowerCase() });
  
      if (!user) {
          return res.status(404).json({ message: "User not found." });
      }
  
      //const hashedPassword = await bcrypt.hash(password, 10);
  
      await UserModel.updateOne({ email: email.toLowerCase() }, { $set: { password: password } });
  
      res.status(200).json({ message: "Password updated successfully." });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ message: "Internal server error." });
    }
  });

  router.patch('/update-userdata/:userId', upload.single('file'), async (req, res) => {
    try {
        const userId = req.params.userId;
        const filePath = req.file?.path;
        if (!filePath) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
  
        const updatedUser = await UserModel.findByIdAndUpdate(userId, {
            image: filePath,  
        }, { new: true });
  
        const savedMessage = await updatedUser.save();
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }
  
        // Send a response with the updated user data
        res.status(200).json({
            message: 'User data updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
  });
export default router;