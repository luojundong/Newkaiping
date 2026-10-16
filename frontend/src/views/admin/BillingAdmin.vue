<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Banknote, Plus, Edit, Trash2, Wallet } from 'lucide-vue-next'
import { billingApi } from '@/api'
import type {
  BillingPrice,
  BillingPriceType,
  BillingQuota,
  BillingQuotaScope,
  BillingAccount,
  BillingRecharge,
} from '@/types/api'
import {
  BILLING_PRICE_TYPES,
  BILLING_QUOTA_SCOPES,
} from '@/types/api'

const tab = ref<'prices' | 'quotas' | 'accounts'>('prices')

// 通用提示
function errMsg(e: unknown): string {
  return (e as Error).message || '操作失败'
}

// ---------- 电价 ----------
const priceLoading = ref(false)
const prices = ref<BillingPrice[]>([])
const priceDialog = ref(false)
const priceSaving = ref(false)
const priceEditingId = ref<string | null>(null)
const priceRef = ref()
const priceForm = reactive({
  name: '',
  type: 'flat' as BillingPriceType,
  price: 0,
  start: '00:00',
  end: '24:00',
  unit: '元/kWh',
})
const priceRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择类型', trigger: 'change' }],
}

async function loadPrices() {
  priceLoading.value = true
  try {
    prices.value = (await billingApi.prices()) as unknown as BillingPrice[]
  } catch {
    prices.value = []
  } finally {
    priceLoading.value = false
  }
}
function openPriceCreate() {
  priceEditingId.value = null
  Object.assign(priceForm, { name: '', type: 'flat', price: 0, start: '00:00', end: '24:00', unit: '元/kWh' })
  priceDialog.value = true
}
function openPriceEdit(p: BillingPrice) {
  priceEditingId.value = p.id
  Object.assign(priceForm, {
    name: p.name,
    type: p.type,
    price: p.price,
    start: p.start,
    end: p.end,
    unit: p.unit,
  })
  priceDialog.value = true
}
async function submitPrice() {
  if (!priceRef.value) return
  try {
    await priceRef.value.validate()
  } catch {
    return
  }
  priceSaving.value = true
  const body = {
    name: priceForm.name,
    type: priceForm.type,
    price: priceForm.price,
    start: priceForm.start,
    end: priceForm.end,
    unit: priceForm.unit,
  }
  try {
    if (priceEditingId.value) {
      await billingApi.updatePrice(priceEditingId.value, body)
      ElMessage.success('电价已更新')
    } else {
      await billingApi.createPrice(body)
      ElMessage.success('电价已创建')
    }
    priceDialog.value = false
    loadPrices()
  } catch (e) {
    ElMessage.error(errMsg(e))
  } finally {
    priceSaving.value = false
  }
}
async function removePrice(p: BillingPrice) {
  try {
    await ElMessageBox.confirm(`确认删除电价「${p.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await billingApi.removePrice(p.id)
    ElMessage.success('电价已删除')
    loadPrices()
  } catch (e) {
    ElMessage.error(errMsg(e))
  }
}

// ---------- 配额 ----------
const quotaLoading = ref(false)
const quotas = ref<BillingQuota[]>([])
const quotaDialog = ref(false)
const quotaSaving = ref(false)
const quotaEditingId = ref<string | null>(null)
const quotaRef = ref()
const quotaForm = reactive({
  scope: 'building' as BillingQuotaScope,
  ref_id: '',
  quota_kwh: 0,
  warning_pct: 80,
})
const quotaRules = {
  scope: [{ required: true, message: '请选择范围', trigger: 'change' }],
  ref_id: [{ required: true, message: '请输入关联对象ID', trigger: 'blur' }],
  quota_kwh: [{ required: true, message: '请输入配额', trigger: 'blur' }],
}

async function loadQuotas() {
  quotaLoading.value = true
  try {
    quotas.value = (await billingApi.quotas()) as unknown as BillingQuota[]
  } catch {
    quotas.value = []
  } finally {
    quotaLoading.value = false
  }
}
function openQuotaCreate() {
  quotaEditingId.value = null
  Object.assign(quotaForm, { scope: 'building', ref_id: '', quota_kwh: 0, warning_pct: 80 })
  quotaDialog.value = true
}
function openQuotaEdit(q: BillingQuota) {
  quotaEditingId.value = q.id
  Object.assign(quotaForm, {
    scope: q.scope,
    ref_id: q.ref_id,
    quota_kwh: q.quota_kwh,
    warning_pct: q.warning_pct,
  })
  quotaDialog.value = true
}
async function submitQuota() {
  if (!quotaRef.value) return
  try {
    await quotaRef.value.validate()
  } catch {
    return
  }
  quotaSaving.value = true
  const body = {
    scope: quotaForm.scope,
    ref_id: quotaForm.ref_id,
    period: 'month',
    quota_kwh: quotaForm.quota_kwh,
    warning_pct: quotaForm.warning_pct,
  }
  try {
    if (quotaEditingId.value) {
      await billingApi.updateQuota(quotaEditingId.value, body)
      ElMessage.success('配额已更新')
    } else {
      await billingApi.createQuota(body)
      ElMessage.success('配额已创建')
    }
    quotaDialog.value = false
    loadQuotas()
  } catch (e) {
    ElMessage.error(errMsg(e))
  } finally {
    quotaSaving.value = false
  }
}
async function removeQuota(q: BillingQuota) {
  try {
    await ElMessageBox.confirm(`确认删除配额（${q.ref_id}）？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await billingApi.removeQuota(q.id)
    ElMessage.success('配额已删除')
    loadQuotas()
  } catch (e) {
    ElMessage.error(errMsg(e))
  }
}

// ---------- 账户 / 充值 ----------
const accountLoading = ref(false)
const accounts = ref<BillingAccount[]>([])
const rechargeDialog = ref(false)
const rechargeSaving = ref(false)
const rechargeForm = reactive<BillingRecharge & { accountId: string }>({
  accountId: '',
  scope: 'building',
  ref_id: '',
  amount: 0,
  remark: '',
})
const rechargeRef = ref()
const rechargeRules = {
  ref_id: [{ required: true, message: '请输入账户关联ID', trigger: 'blur' }],
  amount: [{ required: true, message: '请输入充值金额', trigger: 'blur' }],
}

async function loadAccounts() {
  accountLoading.value = true
  try {
    accounts.value = (await billingApi.accounts()) as unknown as BillingAccount[]
  } catch {
    accounts.value = []
  } finally {
    accountLoading.value = false
  }
}
function openRecharge(a?: BillingAccount) {
  Object.assign(rechargeForm, {
    accountId: a?.id || '',
    scope: (a?.scope as string) || 'building',
    ref_id: a?.ref_id || '',
    amount: 0,
    remark: '',
  })
  rechargeDialog.value = true
}
async function submitRecharge() {
  if (!rechargeRef.value) return
  try {
    await rechargeRef.value.validate()
  } catch {
    return
  }
  rechargeSaving.value = true
  const body = {
    scope: rechargeForm.scope,
    ref_id: rechargeForm.ref_id,
    amount: rechargeForm.amount,
    remark: rechargeForm.remark || undefined,
  }
  try {
    await billingApi.recharge(body)
    ElMessage.success('充值成功')
    rechargeDialog.value = false
    loadAccounts()
  } catch (e) {
    ElMessage.error(errMsg(e))
  } finally {
    rechargeSaving.value = false
  }
}

onMounted(() => {
  loadPrices()
  loadQuotas()
  loadAccounts()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-toolbar">
      <Banknote :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">计费管理</span>
    </div>

    <el-tabs v-model="tab" class="billing-tabs">
      <!-- 电价 -->
      <el-tab-pane label="电价管理" name="prices">
        <div class="billing-actions">
          <el-button type="primary" :icon="Plus" @click="openPriceCreate">新增电价</el-button>
        </div>
        <el-table :data="prices" v-loading="priceLoading" class="admin-table">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="name" label="名称" width="180" />
          <el-table-column label="类型" width="110">
            <template #default="{ row }">
              <el-tag size="small">
                {{ BILLING_PRICE_TYPES.find((t) => t.value === row.type)?.label || row.type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="价格" width="120">
            <template #default="{ row }">{{ row.price }} {{ row.unit }}</template>
          </el-table-column>
          <el-table-column prop="start" label="起始" width="100" />
          <el-table-column prop="end" label="结束" width="100" />
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openPriceEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removePrice(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 配额 -->
      <el-tab-pane label="配额管理" name="quotas">
        <div class="billing-actions">
          <el-button type="primary" :icon="Plus" @click="openQuotaCreate">新增配额</el-button>
        </div>
        <el-table :data="quotas" v-loading="quotaLoading" class="admin-table">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="范围" width="100">
            <template #default="{ row }">
              {{ BILLING_QUOTA_SCOPES.find((s) => s.value === row.scope)?.label || row.scope }}
            </template>
          </el-table-column>
          <el-table-column prop="ref_id" label="关联对象" width="160" />
          <el-table-column label="周期" width="100"><template #default>月度</template></el-table-column>
          <el-table-column label="配额(kWh)" width="130">
            <template #default="{ row }">{{ row.quota_kwh }}</template>
          </el-table-column>
          <el-table-column label="预警比例" width="120">
            <template #default="{ row }">{{ row.warning_pct }}%</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openQuotaEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeQuota(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 账户 / 充值 -->
      <el-tab-pane label="充值管理" name="accounts">
        <div class="billing-actions">
          <el-button type="primary" :icon="Wallet" @click="openRecharge()">账户充值</el-button>
        </div>
        <el-table :data="accounts" v-loading="accountLoading" class="admin-table">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="id" label="账户ID" min-width="180" />
          <el-table-column prop="scope" label="范围" width="110" />
          <el-table-column prop="ref_id" label="关联对象" width="160" />
          <el-table-column label="余额" width="140">
            <template #default="{ row }">{{ row.balance ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openRecharge(row)">充值</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 电价对话框 -->
    <el-dialog v-model="priceDialog" :title="priceEditingId ? '编辑电价' : '新增电价'" width="520px" append-to-body class="kp-dialog">
      <el-form ref="priceRef" :model="priceForm" :rules="priceRules" label-width="88px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="priceForm.name" placeholder="如 峰时电价" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="priceForm.type" style="width: 100%">
            <el-option v-for="t in BILLING_PRICE_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="价格" prop="price">
              <el-input-number v-model="priceForm.price" :min="0" :step="0.1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位">
              <el-input v-model="priceForm.unit" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="起始时段">
              <el-time-picker v-model="priceForm.start" value-format="HH:mm" format="HH:mm" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束时段">
              <el-time-picker v-model="priceForm.end" value-format="HH:mm" format="HH:mm" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="priceDialog = false">取消</el-button>
        <el-button type="primary" :loading="priceSaving" @click="submitPrice">保存</el-button>
      </template>
    </el-dialog>

    <!-- 配额对话框 -->
    <el-dialog v-model="quotaDialog" :title="quotaEditingId ? '编辑配额' : '新增配额'" width="520px" append-to-body class="kp-dialog">
      <el-form ref="quotaRef" :model="quotaForm" :rules="quotaRules" label-width="88px">
        <el-form-item label="范围" prop="scope">
          <el-select v-model="quotaForm.scope" style="width: 100%">
            <el-option v-for="s in BILLING_QUOTA_SCOPES" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联对象" prop="ref_id">
          <el-input v-model="quotaForm.ref_id" placeholder="楼栋或设备ID" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="配额(kWh)" prop="quota_kwh">
              <el-input-number v-model="quotaForm.quota_kwh" :min="0" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预警比例(%)">
              <el-input-number v-model="quotaForm.warning_pct" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="quotaDialog = false">取消</el-button>
        <el-button type="primary" :loading="quotaSaving" @click="submitQuota">保存</el-button>
      </template>
    </el-dialog>

    <!-- 充值对话框 -->
    <el-dialog v-model="rechargeDialog" title="账户充值" width="480px" append-to-body class="kp-dialog">
      <el-form ref="rechargeRef" :model="rechargeForm" :rules="rechargeRules" label-width="88px">
        <el-form-item label="范围">
          <el-select v-model="rechargeForm.scope" style="width: 100%">
            <el-option label="楼栋" value="building" />
            <el-option label="设备" value="device" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联对象" prop="ref_id">
          <el-input v-model="rechargeForm.ref_id" placeholder="楼栋或设备ID" />
        </el-form-item>
        <el-form-item label="充值金额" prop="amount">
          <el-input-number v-model="rechargeForm.amount" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="rechargeForm.remark" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rechargeDialog = false">取消</el-button>
        <el-button type="primary" :loading="rechargeSaving" @click="submitRecharge">确认充值</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-table { width: 100%; }
.billing-actions { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.billing-tabs { flex: 1; min-height: 0; }
</style>
