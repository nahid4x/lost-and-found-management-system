import mongoose from "mongoose";
const s=new mongoose.Schema({
  name:{type:String,required:true,maxlength:80},
  email:{type:String,required:true,unique:true,lowercase:true,trim:true},
  passwordHash:{type:String,required:true,select:false},
  role:{type:String,enum:["user","admin"],default:"user"},
  disabled:{type:Boolean,default:false},
  emailVerified:Date,phone:{type:String,default:""},avatarUrl:{type:String,default:""},bio:{type:String,default:"",maxlength:300},
  verifyHash:{type:String,select:false},verifyExpires:{type:Date,select:false},
  resetHash:{type:String,select:false},resetExpires:{type:Date,select:false}
},{timestamps:true});
export default mongoose.models.User||mongoose.model("User",s);
