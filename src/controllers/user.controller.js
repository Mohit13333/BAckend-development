import asyncHandler from '../utils/asyncHandler.js';
import ApiError from "../utils/ApiError.js";
import User from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiRespone from "../utils/ApiResponse.js";

const registerUser=asyncHandler(async (req,res) => {

    // get user detail from frontend
    const {fullName,email,username,password}=req.body
    // console.log("email: " , email);

    // validation - not empty

    // if(!fullName || !email || !username ||!password){
    //     throw new ApiError(400,"fullName is required")
    // }
    if(
        [fullName,email,username,password].some((fields) => fields?.trim()==="")
    ){
        throw new ApiError(400,"All fields are required")
    }

    // check if user already exist:username,email

   const existedUser=await User.findOne({$or:[{ username },{ email }]})
   

   if(existedUser){
    throw new ApiError(409, "User already exists")
   }
//    const newUser=new user({fullName,username,email,password});
//    await newUser.save();

//    console.log(req.files);
   // check fro images,check for avatar
   const avatarLocalPath= req.files?.avatar[0]?.path;
//    const coverImagelocalpath=req.files?.coverImage[0]?.path;

   let coverImagelocalpath;
   if (req.files&&Array.isArray(req.files.coverImage)&&req.files.coverImage.length>0){
    coverImagelocalpath=req.files.coverImage[0].path;
   }

    if (!avatarLocalPath){
    throw new ApiError(400,"Avatar file is required")
    }

     // upload them in cloudinary,avatar

    const avatar=await uploadOnCloudinary(avatarLocalPath)
    const coverImage=await uploadOnCloudinary(coverImagelocalpath)
  
   if (!avatarLocalPath) {
   throw new ApiError(400,"Avatar file is required")
   }

   // create user object - create entry in db

  const user = await User.create({
    fullName,
    avatar:avatar.url,
    coverImage:coverImage?.url||"",
    email,
    password,
    username:username.toLowerCase()
  })

  // remove passsword and refresh token field from response

  const createdUser=await User.findById(user._id).select(
    "-password -refreshToken"
  )

// check for user creation

if (!createdUser){
    throw new ApiError(500, "Something went wrong while registering")
}

// return response

return res.status(201).json(
    new ApiRespone(200,createdUser,"user registered successfully")
)

})
export default registerUser
