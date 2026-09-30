import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type { Course, EnrollmentStatus, PaymentMethod } from "@shared/api";
import { authHeaders, formatAxiosError } from "@/lib/api";
import type { RootState } from "../index";

export interface PortalEnrollment {
  id: number;
  editionId: number;
  status: EnrollmentStatus;
  amountCents: number;
  currency: string;
  paymentMethod: PaymentMethod | null;
  cardBrand: string | null;
  cardLast4: string | null;
  title: string;
  slug: string;
  promise: string;
  category: string;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  venueName: string;
  city: string;
  editionStatus: string;
}

interface PortalState {
  enrollments: PortalEnrollment[];
  activeEnrollment: PortalEnrollment | null;
  recommendations: Course[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  errorCode: string | null;
  clientSecret: string | null;
}

const initialState: PortalState = {
  enrollments: [],
  activeEnrollment: null,
  recommendations: [],
  loading: false,
  saving: false,
  error: null,
  errorCode: null,
  clientSecret: null,
};

function upsertEnrollment(list: PortalEnrollment[], enrollment: PortalEnrollment) {
  const index = list.findIndex((item) => item.id === enrollment.id);
  if (index === -1) return [enrollment, ...list];
  const next = list.slice();
  next[index] = enrollment;
  return next;
}

export const fetchEnrollments = createAsyncThunk("portal/enrollments", async (_, { getState, rejectWithValue }) => {
  try {
    const token = (getState() as RootState).userAuth.token;
    const { data } = await axios.get("/api/portal/enrollments", { headers: authHeaders(token) });
    return data.enrollments as PortalEnrollment[];
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const fetchEnrollment = createAsyncThunk(
  "portal/enrollment",
  async (enrollmentId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.get(`/api/portal/enrollments/${enrollmentId}`, {
        headers: authHeaders(token),
      });
      return data.enrollment as PortalEnrollment;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return rejectWithValue({ code: "not_found", message: formatAxiosError(error) });
      }
      return rejectWithValue({ code: "load_failed", message: formatAxiosError(error) });
    }
  },
);

export const fetchRecommendations = createAsyncThunk(
  "portal/recommendations",
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.get("/api/portal/recommendations", { headers: authHeaders(token) });
      return data.courses as Course[];
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const reserveSeat = createAsyncThunk(
  "portal/reserve",
  async (editionId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post("/api/portal/enrollments", { editionId }, { headers: authHeaders(token) });
      return data as { enrollmentId: number; resumed?: boolean; alreadyPaid?: boolean };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const startCheckout = createAsyncThunk(
  "portal/checkout",
  async (enrollmentId: number, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post(
        "/api/portal/checkout",
        { enrollmentId },
        { headers: authHeaders(token) },
      );
      return data as { clientSecret: string; sessionId?: string; reused?: boolean };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code;
        if (typeof code === "string") {
          return rejectWithValue({ code, message: formatAxiosError(error) });
        }
      }
      return rejectWithValue({ code: "checkout_failed", message: formatAxiosError(error) });
    }
  },
);

export const confirmCheckout = createAsyncThunk(
  "portal/confirmCheckout",
  async (sessionId: string, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      const { data } = await axios.post(
        "/api/portal/checkout/confirm",
        { sessionId },
        { headers: authHeaders(token) },
      );
      return data as { status: "paid" | "pending_oxxo"; enrollmentId: number };
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const sendFeedback = createAsyncThunk(
  "portal/feedback",
  async (body: { enrollmentId: number; rating: number; comment?: string }, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).userAuth.token;
      await axios.post("/api/portal/feedback", body, { headers: authHeaders(token) });
      return true;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

const portalSlice = createSlice({
  name: "portal",
  initialState,
  reducers: {
    clearPortalError(state) {
      state.error = null;
      state.errorCode = null;
    },
    clearCheckout(state) {
      state.clientSecret = null;
      state.error = null;
      state.errorCode = null;
      state.activeEnrollment = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnrollments.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(fetchEnrollments.fulfilled, (state, action) => {
        state.loading = false;
        state.enrollments = action.payload;
        if (state.activeEnrollment) {
          const refreshed = action.payload.find((item) => item.id === state.activeEnrollment?.id);
          if (refreshed) state.activeEnrollment = refreshed;
        }
      })
      .addCase(fetchEnrollments.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(fetchEnrollment.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(fetchEnrollment.fulfilled, (state, action) => {
        state.loading = false;
        state.activeEnrollment = action.payload;
        state.enrollments = upsertEnrollment(state.enrollments, action.payload);
      })
      .addCase(fetchEnrollment.rejected, (state, action) => {
        state.loading = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "load_failed";
        state.activeEnrollment = null;
      })
      .addCase(fetchRecommendations.fulfilled, (state, action) => {
        state.recommendations = action.payload;
      })
      .addCase(reserveSeat.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
      })
      .addCase(reserveSeat.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(reserveSeat.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      })
      .addCase(startCheckout.pending, (state) => {
        state.saving = true;
        state.error = null;
        state.errorCode = null;
        state.clientSecret = null;
      })
      .addCase(startCheckout.fulfilled, (state, action) => {
        state.saving = false;
        state.clientSecret = action.payload.clientSecret;
      })
      .addCase(startCheckout.rejected, (state, action) => {
        state.saving = false;
        const payload = action.payload as { code?: string; message?: string } | undefined;
        state.error = payload?.message || String(action.payload || "");
        state.errorCode = payload?.code || "checkout_failed";
        state.clientSecret = null;
      })
      .addCase(confirmCheckout.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(sendFeedback.rejected, (state, action) => {
        state.error = String(action.payload || "");
      });
  },
});

export const { clearPortalError, clearCheckout } = portalSlice.actions;
export default portalSlice.reducer;
