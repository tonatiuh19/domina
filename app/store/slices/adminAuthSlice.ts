import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type { AdminProfile, AppLanguage } from "@shared/api";
import { ADMIN_TOKEN_KEY, authHeaders, formatAxiosError, readToken, writeToken } from "@/lib/api";
import { resolveAppLanguage } from "@/lib/language";
import i18n from "@/i18n";

interface AdminAuthState {
  token: string | null;
  admin: AdminProfile | null;
  checking: boolean;
  sending: boolean;
  verifying: boolean;
  error: string | null;
  devCode: string | null;
}

const initialState: AdminAuthState = {
  token: readToken(ADMIN_TOKEN_KEY),
  admin: null,
  checking: false,
  sending: false,
  verifying: false,
  error: null,
  devCode: null,
};

export const checkAdminEmail = createAsyncThunk(
  "adminAuth/check",
  async (email: string, { rejectWithValue }) => {
    try {
      const { data } = await axios.post("/api/auth/admin/check", { email });
      return data as { exists: boolean };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const requestAdminOtp = createAsyncThunk(
  "adminAuth/request",
  async (
    body: { email: string; companyName?: string; contactName?: string },
    { rejectWithValue },
  ) => {
    try {
      const { data } = await axios.post("/api/auth/admin/request-otp", body);
      return data as { ok: boolean; devCode?: string };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const verifyAdminOtp = createAsyncThunk(
  "adminAuth/verify",
  async (body: { email: string; code: string }, { rejectWithValue }) => {
    try {
      const { data } = await axios.post("/api/auth/admin/verify-otp", {
        ...body,
        preferredLanguage: resolveAppLanguage(i18n.language),
      });
      return data as { token: string; admin: AdminProfile };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchAdminMe = createAsyncThunk("adminAuth/me", async (_, { getState, rejectWithValue }) => {
  try {
    const token = (getState() as { adminAuth: AdminAuthState }).adminAuth.token;
    const { data } = await axios.get("/api/auth/admin/me", { headers: authHeaders(token) });
    return data.admin as AdminProfile;
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const updateAdminLanguage = createAsyncThunk(
  "adminAuth/language",
  async (language: AppLanguage, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as { adminAuth: AdminAuthState }).adminAuth.token;
      const { data } = await axios.put(
        "/api/auth/admin/language",
        { language },
        { headers: authHeaders(token) },
      );
      return data.admin as AdminProfile;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const logoutAdmin = createAsyncThunk("adminAuth/logout", async (_, { getState }) => {
  const token = (getState() as { adminAuth: AdminAuthState }).adminAuth.token;
  await axios.post("/api/auth/admin/logout", {}, { headers: authHeaders(token) }).catch(() => undefined);
});

const adminAuthSlice = createSlice({
  name: "adminAuth",
  initialState,
  reducers: {
    clearAdminError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkAdminEmail.pending, (state) => {
        state.checking = true;
        state.error = null;
      })
      .addCase(checkAdminEmail.fulfilled, (state) => {
        state.checking = false;
      })
      .addCase(checkAdminEmail.rejected, (state, action) => {
        state.checking = false;
        state.error = String(action.payload || "");
      })
      .addCase(requestAdminOtp.pending, (state) => {
        state.sending = true;
        state.error = null;
      })
      .addCase(requestAdminOtp.fulfilled, (state, action) => {
        state.sending = false;
        state.devCode = action.payload.devCode || null;
      })
      .addCase(requestAdminOtp.rejected, (state, action) => {
        state.sending = false;
        state.error = String(action.payload || "");
      })
      .addCase(verifyAdminOtp.pending, (state) => {
        state.verifying = true;
        state.error = null;
      })
      .addCase(verifyAdminOtp.fulfilled, (state, action) => {
        state.verifying = false;
        state.token = action.payload.token;
        state.admin = action.payload.admin;
        writeToken(ADMIN_TOKEN_KEY, action.payload.token);
      })
      .addCase(verifyAdminOtp.rejected, (state, action) => {
        state.verifying = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchAdminMe.fulfilled, (state, action) => {
        state.admin = action.payload;
      })
      .addCase(fetchAdminMe.rejected, (state) => {
        state.token = null;
        state.admin = null;
        writeToken(ADMIN_TOKEN_KEY, null);
      })
      .addCase(updateAdminLanguage.fulfilled, (state, action) => {
        state.admin = action.payload;
      })
      .addCase(logoutAdmin.fulfilled, (state) => {
        state.token = null;
        state.admin = null;
        writeToken(ADMIN_TOKEN_KEY, null);
      });
  },
});

export const { clearAdminError } = adminAuthSlice.actions;
export default adminAuthSlice.reducer;
