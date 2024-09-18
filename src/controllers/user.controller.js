import asyncHandler from '../utils/asyncHandler.js';
import ApiError from "../utils/ApiError.js";
import User from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiRespone from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
import ApiResponse from '../utils/ApiResponse.js';

const generateAccessAndRefreshToken =async (userId) => {
  try {
    const user=await User.findById(userId);
    const accesstoken=user.generateAccessToken()
    const refreshToken=user.generateRefreshToken()

    user.refreshToken = refreshToken
    await user.save({validateBeforeSave:false})
    return {accesstoken,refreshToken}

  } catch (error) {
    throw new ApiError(500,"Something went wrong while generating access and refresh token")
  }
}

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

const loginUser=asyncHandler(async (req, res) =>{

  // req body -> data

  const {email,username,password}=req.body

  // username and email
  if (!username && !email){
    throw new ApiError(400,"Username and email required")
  }

  // find the user

  const user=await User.findOne({$and:[{username},{email}]})

  if(!user){
    throw new ApiError(404,"credentials not found")
  }

  // check passsword
  const ispasswordvalid=await user.isPasswordCorrect(password)
  if(!ispasswordvalid){
    throw new ApiError(401,"Password is incorrect")
  }

  // access and refresh token

  const {accesstoken,refreshToken}=await generateAccessAndRefreshToken(user._id)

  const logedInUser=await User.findById(user._id).select("-password -refreshToken")

  // sned cookies

  const options ={
    httpOnly: true,
    secure:true
  }

  // return response

  return res.status(200).cookie("accessToken",accesstoken,options).cookie("refreshToken",refreshToken,options).json(
    new ApiRespone(
      200,
      {
        user:logedInUser,accesstoken,refreshToken
      },
      "User loggedIn successfully"
    )
  )


})

const logoutUser=asyncHandler(async(req,res)=>{
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set:{
        refreshToken:undefined
      }
    },
    {
      new:true
    }
  )
  const options ={
    httpOnly: true,
    secure:true
  }
  return res.status(200).clearCookie("accessToken",options)
  .clearCookie("refreshToken",options)
  .json(new ApiRespone(200,{},"User Logged Out"))
})

const refreshAcccessToken=asyncHandler(async(req,res)=>{
  const incommingRefreshToken=req.cookies.refreshToken||req.body.refreshToken
  if(!incommingRefreshToken){
    throw new ApiError(401,"unauthorized request")
  }
 try {
  const decodedToken=jwt.verify(incommingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
  const user= await User.findById(decodedToken?._id)
  if(!user){
   throw new ApiError(401,"Invalid refresh token")
  }
  if (incommingRefreshToken !== user?.refreshToken) {
     throw new ApiError(401,"Refresh token is expired or used")
  }
  const options={
   httpOnly: true,
   secure:true,
  }
  const {accessToken,newRefreshToken}=await generateAccessAndRefreshToken(user._id)
  return res
  .status(200)
  .cookie("accessToken",accessToken,options)
  .cookie("refreshToken",newRefreshToken,options)
  .json(
   new ApiRespone(
     200,
     {accessToken,refreshToken:newRefreshToken},
     "Access token refresh"
   )
  )
 } catch (error) {
  throw new ApiError(401,error?.message || "Invalid refresh token")
  
 }
})
const changeCurrentPassword = asyncHandler(async(req, res)=>{
  const {oldPassword,newPassword}=req.body
  const user=await User.findById(req.user?._id)
  const isPasswordCorrect=await user.isPasswordCorrect(oldPassword)
  if(!isPasswordCorrect){
    throw new ApiError(401,"Invalid old password")
  }
  user.password = newPassword
  await user.save({validateBeforeSave:false})

  return res.status(200).json(new ApiRespone(
    200,{},"Password changed successfully"
  ))
})

const getCurrentUser=asyncHandler(async(req, res)=>{
  return res.status(200).json(200,req.user,"current usre fetched successfully")
})

const updateAccountDetails=asyncHandler(async(req, res)=>{
  const {fullName,email}=req.body
  if(!fullName||!email){
    throw new ApiError(400,"All fields are required")
  }
  User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        fullName:fullName,
        email,
      }
    },
    {new:true}
  ).select("-password")
  return res.status(200).json(new ApiRespone(200,user,"Account updated successfully"))
})

const updateAvatar=asyncHandler(async(req, res)=>{
  const avatarLocalPath=req.file?.path
  if (!avatarLocalPath) {
    throw new ApiError(400,"Avatar file is missing")
  }
  //todo: delete old image assignment
  const avatar=await uploadOnCloudinary(avatarLocalPath)
  if (!avatar.url) {
    throw new ApiError(400,"error while uploading on avatar")
  }
  const user=await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        avatar:avatar.url
      }
    },
    {new:true}
  ).select("-password")

  return res.status(200)
  .json(
    new ApiResponse(200,user, "Avatar updated successfully")
  )

})
const updateCoverImage=asyncHandler(async(req, res)=>{
  const coverImageLocalPath=req.file?.path
  if (!coverImageLocalPath) {
    throw new ApiError(400,"Cover-Image file is missing")
  }
  const coverImage=await uploadOnCloudinary(coverImageLocalPath)
  if (!coverImage.url) {
    throw new ApiError(400,"error while uploading on Cover-Image")
  }
  const user=await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set:{
        coverImage:coverImage.url
      }
    },
    {new:true}
  ).select("-password")

  return res.status(200)
  .json(
    new ApiResponse(200,user, "Cover-Image updated successfully")
  )

})

const getUserChannelProfile=asyncHandler(async(req,res) => {
  const {username}=req.params

  if(!username?.trim()){
    throw new ApiError(400,"username is missing")
  }

  const channel=await User.aggregate([
    {
      $match:{
        username: username?.toLowerCase()
      }
    },
    {
      $lookup:{
        from:"subscriptions",
        localField:"_id",
        foreignField:"channel",
        as:"subscribers"
      }
    },
    {
      $lookup:{
        from:"subscriptions",
        localField:"_id",
        foreignField:"subscriber",
        as:"subscribedTo"
      }
    },
    {
      $addFields:{
        subscribersCount:{
          $size:"$subscribers"
        },
        channelSubscribedTocount:{
          $size:"$subscribedTo"
        },
        isSubscribed:{
          $cond:{
            if:{$in: [req.user?._id,"$subscribers.subscriber"]},
            then:true,
            else:false
          }
        }
      }
    },
    {
      $project: {
          fullName: 1,
          username: 1,
          subscribersCount: 1,
          channelsSubscribedToCount: 1,
          isSubscribed: 1,
          avatar: 1,
          coverImage: 1,
          email: 1

      }
  }
  ])
  if(!channel?.length){
    throw new ApiError(404,"channel does not exist")
  }
  return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0], "User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req, res) => {
  const user = await User.aggregate([
      {
          $match: {
              _id: new mongoose.Types.ObjectId(req.user._id)
          }
      },
      {
          $lookup: {
              from: "videos",
              localField: "watchHistory",
              foreignField: "_id",
              as: "watchHistory",
              pipeline: [
                  {
                      $lookup: {
                          from: "users",
                          localField: "owner",
                          foreignField: "_id",
                          as: "owner",
                          pipeline: [
                              {
                                  $project: {
                                      fullName: 1,
                                      username: 1,
                                      avatar: 1
                                  }
                              }
                          ]
                      }
                  },
                  {
                      $addFields:{
                          owner:{
                              $first: "$owner"
                          }
                      }
                  }
              ]
          }
      }
  ])

  return res
  .status(200)
  .json(
      new ApiResponse(
          200,
          user[0].watchHistory,
          "Watch history fetched successfully"
      )
  )
})


export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAcccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateAvatar,
  updateCoverImage,
  getUserChannelProfile,
  getWatchHistory
}
