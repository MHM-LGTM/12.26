"""
认证路由
---------------------------------
功能：
- /auth/register - 用户注册
- /auth/token - 用户登录（获取 Token）
- /auth/me - 获取当前用户信息

使用：
- 前端调用这些接口进行用户注册、登录、获取用户信息
- 登录成功后返回 JWT Token，前端保存并在后续请求中携带
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from datetime import datetime
import re

from ..models.user import User
from ..services.auth_service import hash_password, verify_password, create_access_token, decode_access_token
from ..config.database import get_db
from ..models.response_schema import ApiResponse

router = APIRouter()

# OAuth2 密码流（用于提取 Token）
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


# ============================================================================
# Pydantic 模型
# ============================================================================

class RegisterRequest(BaseModel):
    """注册请求"""
    phone_number: str = Field(..., min_length=11, max_length=11, description="手机号")
    password: str = Field(..., min_length=6, description="密码")


class UserResponse(BaseModel):
    """用户信息响应"""
    id: int
    phone_number: str


# ============================================================================
# 工具函数
# ============================================================================

def validate_phone_number(phone: str) -> bool:
    """
    校验中国大陆手机号格式
    
    Args:
        phone: 手机号字符串
        
    Returns:
        是否符合格式
    """
    pattern = r'^1[3-9]\d{9}$'
    return bool(re.match(pattern, phone))


def mask_phone_number(phone: str) -> str:
    """
    脱敏手机号：138****8888
    
    Args:
        phone: 原始手机号
        
    Returns:
        脱敏后的手机号
    """
    if len(phone) == 11:
        return f"{phone[:3]}****{phone[7:]}"
    return phone


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User | None:
    """
    依赖注入：获取当前登录用户
    
    用法：
    @router.get("/protected")
    async def protected(current_user: User = Depends(get_current_user)):
        ...
    
    Args:
        token: JWT Token
        db: 数据库会话
        
    Returns:
        当前用户对象，未登录返回 None
    """
    if not token:
        return None
    
    payload = decode_access_token(token)
    if not payload:
        return None
    
    user_id = payload.get("user_id")
    if not user_id:
        return None
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    return user


# ============================================================================
# API 路由
# ============================================================================

@router.post("/register", response_model=ApiResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    用户注册
    
    请求体：
    - phone_number: 手机号（11位）
    - password: 密码（至少6位）
    
    返回：
    - 注册成功的用户信息
    """
    
    # 校验手机号格式
    if not validate_phone_number(req.phone_number):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="手机号格式错误"
        )
    
    # 检查手机号是否已存在
    result = await db.execute(
        select(User).where(User.phone_number == req.phone_number)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该手机号已注册"
        )
    
    # 创建用户
    hashed_pwd = hash_password(req.password)
    new_user = User(
        phone_number=req.phone_number,
        hashed_password=hashed_pwd
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return ApiResponse.ok({
        "id": new_user.id,
        "phone_number": mask_phone_number(new_user.phone_number),
        "message": "注册成功"
    })


@router.post("/token", response_model=ApiResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录（获取 Token）
    
    请求体（application/x-www-form-urlencoded）：
    - username: 手机号（字段名必须是 username，符合 OAuth2 标准）
    - password: 密码
    
    返回：
    - access_token: JWT Token
    - token_type: "bearer"
    - user: 用户信息
    """
    
    # form_data.username 实际上是手机号
    phone_number = form_data.username
    password = form_data.password
    
    # 查询用户
    result = await db.execute(
        select(User).where(User.phone_number == phone_number)
    )
    user = result.scalar_one_or_none()
    
    # 验证用户和密码
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="手机号或密码错误"
        )
    
    # 更新最后登录时间
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # 生成 Token
    access_token = create_access_token(data={"user_id": user.id})
    
    return ApiResponse.ok({
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "phone_number": mask_phone_number(user.phone_number)
        }
    })


@router.get("/me", response_model=ApiResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    获取当前用户信息
    
    需要在请求头中携带 Token：
    Authorization: Bearer <token>
    
    返回：
    - 当前用户信息
    """
    
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录"
        )
    
    return ApiResponse.ok({
        "id": current_user.id,
        "phone_number": mask_phone_number(current_user.phone_number)
    })




