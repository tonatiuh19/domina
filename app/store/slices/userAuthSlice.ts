import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type { AppLanguage, Audience, UserProfile } from "@shared/api";
import { USER_TOKEN_KEY, authHeaders, formatAxiosError, readToken, writeToken } from "@/lib/api";
import { resolveAppLanguage } from "@/lib/language";
import i18n from "@/i18n";

interface UserAuthState {
  token: string | null;
  user: UserProfile | null;
  checking: boolean;
  sending: boolean;
  verifying: boolean;
  error: string | null;
  devCode: string | null;
}

const initialState: UserAuthState = {
  token: readToken(USER_TOKEN_KEY),
  user: null,
  checking: false,
  sending: false,
  verifying: false,
  error: null,
  devCode: null,
};

export const checkUserEmail = createAsyncThunk(
  "userAuth/check",
  async (email: string, { rejectWithValue }) => {
    try {
      const { data } = await axios.post("/api/auth/user/check", { email });
      return data as { exists: boolean };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const requestUserOtp = createAsyncThunk(
  "userAuth/request",
  async (
    body: {
      email: string;
      firstName?: string;
      lastName?: string;
      audience?: Audience;
      preferredLanguage?: AppLanguage;
    },
    { rejectWithValue },
  ) => {
    try {
      const preferredLanguage = body.preferredLanguage || resolveAppLanguage(i18n.language);
      const { data } = await axios.post("/api/auth/user/request-otp", { ...body, preferredLanguage });
      return data as { ok: boolean; devCode?: string };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const verifyUserOtp = createAsyncThunk(
  "userAuth/verify",
  async (body: { email: string; code: string }, { rejectWithValue }) => {
    try {
      const { data } = await axios.post("/api/auth/user/verify-otp", {
        ...body,
        preferredLanguage: resolveAppLanguage(i18n.language),
      });
      return data as { token: string; user: UserProfile };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchUserMe = createAsyncThunk("userAuth/me", async (_, { getState, rejectWithValue }) => {
  try {
    const token = (getState() as { userAuth: UserAuthState }).userAuth.token;
    const { data } = await axios.get("/api/auth/user/me", { headers: authHeaders(token) });
    return data.user as UserProfile;
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const updateUserProfile = createAsyncThunk(
  "userAuth/update",
  async (
    body: {
      firstName: string;
      lastName: string;
      phone?: string | null;
      audience: Audience;
      preferredLanguage?: AppLanguage | null;
    },
    { getState, rejectWithValue },
  ) => {
    try {
      const token = (getState() as { userAuth: UserAuthState }).userAuth.token;
      const { data } = await axios.patch("/api/auth/user/me", body, { headers: authHeaders(token) });
      return data.user as UserProfile;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const updateUserLanguage = createAsyncThunk(
  "userAuth/language",
  async (language: AppLanguage, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as { userAuth: UserAuthState }).userAuth.token;
      const { data } = await axios.put(
        "/api/auth/user/language",
        { language },
        { headers: authHeaders(token) },
      );
      return data.user as UserProfile;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const logoutUser = createAsyncThunk("userAuth/logout", async (_, { getState }) => {
  const token = (getState() as { userAuth: UserAuthState }).userAuth.token;
  await axios.post("/api/auth/user/logout", {}, { headers: authHeaders(token) }).catch(() => undefined);
});

const userAuthSlice = createSlice({
  name: "userAuth",
  initialState,
  reducers: {
    clearUserError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkUserEmail.pending, (state) => {
        state.checking = true;
        state.error = null;
      })
      .addCase(checkUserEmail.fulfilled, (state) => {
        state.checking = false;
      })
      .addCase(checkUserEmail.rejected, (state, action) => {
        state.checking = false;
        state.error = String(action.payload || "");
      })
      .addCase(requestUserOtp.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(requestUserOtp.fulfilled, (state, action) => {
        state.sending = false;
        state.devCode = action.payload.devCode || null;
      })
      .addCase(requestUserOtp.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload || "");
      })
      .addCase(verifyUserOtp.pending, (state) => {
        state.verifying = true;
        state.error = null;
      })
      .addCase(verifyUserOtp.fulfilled, (state, action) => {
        state.verifying = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        writeToken(USER_TOKEN_KEY, action.payload.token);
      })
      .addCase(verifyUserOtp.rejected, (state, action) => {
        state.verifying = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchUserMe.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchUserMe.rejected, (state) => {
        state.token = null;
        state.user = null;
        writeToken(USER_TOKEN_KEY, null);
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(updateUserLanguage.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        writeToken(USER_TOKEN_KEY, null);
      });
  },
});

export const { clearUserError } = userAuthSlice.actions;
export default userAuthSlice.reducer;
