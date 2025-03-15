import express from "express";
import multer from "multer";
import UserModel from "../model/user.model.js";
import GroupModel from "../model/group.model.js";

const router = express.Router();

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


router.patch('/creategroup/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const { groupName, groupMembers, groupIcon } = req.body;
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const createdGroup = new GroupModel({
            groupName,
            groupMembers,
            groupIcon,
            groupAdmin: user._id,
        });
        await createdGroup.save();

        const allMembers = [...groupMembers, userId]
        await UserModel.updateMany(
            { _id: { $in: allMembers } },
            { $push: { groups: createdGroup._id } }
        );

        res.status(200).json({
            message: "Group created successfully.",
            group: createdGroup,
        });
    } catch (error) {
        console.error("Error creating group:", error);
        res.status(500).json({ message: "Internal server error." });
    }
});

router.patch('/update-groupData/:userId', upload.single('file'), async (req, res) => {
    try {
        const userId = req.params.userId;
        const filePath = req.file?.path;
        if (!filePath) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
  
        const updatedGroup = await GroupModel.findByIdAndUpdate(userId, {
            image: filePath,  
        }, { new: true });
  
        const savedMessage = await updatedGroup.save();
        if (!updatedGroup) {
            return res.status(404).json({ message: 'User not found' });
        }
  
        // Send a response with the updated user data
        res.status(200).json({
            message: 'Group data updated successfully',
            user: updatedGroup
        });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  router.patch('/update_group_member/:groupId', async (req, res) => {
    const { groupId } = req.params;
    const { groupMembers } = req.body;

    try {
        if (!groupMembers || !Array.isArray(groupMembers)) {
            return res.status(400).json({ message: 'Invalid groupMembers data' });
        }
        
        const updatedGroup = await GroupModel.findByIdAndUpdate(
            groupId,
            { $addToSet: { groupMembers: { $each: groupMembers } } },
            { new: true, runValidators: true }
        );

        if (!updatedGroup) {
            return res.status(404).json({ message: 'Group not found' });
        }

        res.status(200).json({ message: 'Group members updated successfully', updatedGroup });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  router.patch('/delete_group/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const deletedGroup = await GroupModel.findByIdAndDelete(id);

        if (!deletedGroup) {
            return res.status(404).json({ message: 'Group not found' });
        }

        res.status(200).json({ message: 'Group deleted successfully', deletedGroup });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

export default router;