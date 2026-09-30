import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import axios from "axios";
import type { SitePage, SitePageAdmin } from "@shared/api";
import { authHeaders, formatAxiosError } from "@/lib/api";
import type { RootState } from "../index";

interface SiteState {
  page: SitePage | null;
  adminPages: Array<Pick<SitePageAdmin, "slug" | "titleEs" | "titleEn" | "updatedAt">>;
  adminPage: SitePageAdmin | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const initialState: SiteState = {
  page: null,
  adminPages: [],
  adminPage: null,
  loading: false,
  saving: false,
  error: null,
};

export const fetchSitePage = createAsyncThunk(
  "site/page",
  async (input: { slug: string; lang: "es" | "en" }, { rejectWithValue }) => {
    try {
      const { data } = await axios.get(`/api/site/pages/${input.slug}`, {
        params: { lang: input.lang },
      });
      return data.page as SitePage;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const fetchAdminPages = createAsyncThunk("site/adminPages", async (_, { getState, rejectWithValue }) => {
  try {
    const token = (getState() as RootState).adminAuth.token;
    const { data } = await axios.get("/api/admin/pages", { headers: authHeaders(token) });
    return data.pages as SiteState["adminPages"];
  } catch (error) {
    return rejectWithValue(formatAxiosError(error));
  }
});

export const fetchAdminPage = createAsyncThunk(
  "site/adminPage",
  async (slug: string, { getState, rejectWithValue }) => {
    try {
      const token = (getState() as RootState).adminAuth.token;
      const { data } = await axios.get(`/api/admin/pages/${slug}`, { headers: authHeaders(token) });
      return data.page as SitePageAdmin;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

export const saveAdminPage = createAsyncThunk(
  "site/saveAdminPage",
  async (
    input: {
      slug: string;
      titleEs: string;
      titleEn: string;
      bodyMdEs: string;
      bodyMdEn: string;
    },
    { getState, rejectWithValue },
  ) => {
    try {
      const token = (getState() as RootState).adminAuth.token;
      const { data } = await axios.patch(`/api/admin/pages/${input.slug}`, input, {
        headers: authHeaders(token),
      });
      return data.page as SitePageAdmin;
    } catch (error) {
      return rejectWithValue(formatAxiosError(error));
    }
  },
);

const siteSlice = createSlice({
  name: "site",
  initialState,
  reducers: {
    clearSiteError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSitePage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSitePage.fulfilled, (state, action) => {
        state.loading = false;
        state.page = action.payload;
      })
      .addCase(fetchSitePage.rejected, (state, action) => {
        state.loading = false;
        state.page = null;
        state.error = String(action.payload || "");
      })
      .addCase(fetchAdminPages.fulfilled, (state, action) => {
        state.adminPages = action.payload;
      })
      .addCase(fetchAdminPages.rejected, (state, action) => {
        state.error = String(action.payload || "");
      })
      .addCase(fetchAdminPage.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminPage.fulfilled, (state, action) => {
        state.loading = false;
        state.adminPage = action.payload;
      })
      .addCase(fetchAdminPage.rejected, (state, action) => {
        state.loading = false;
        state.error = String(action.payload || "");
      })
      .addCase(saveAdminPage.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(saveAdminPage.fulfilled, (state, action) => {
        state.saving = false;
        state.adminPage = action.payload;
      })
      .addCase(saveAdminPage.rejected, (state, action) => {
        state.saving = false;
        state.error = String(action.payload || "");
      });
  },
});

export const { clearSiteError } = siteSlice.actions;
export default siteSlice.reducer;
