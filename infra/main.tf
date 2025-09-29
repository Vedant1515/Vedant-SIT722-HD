locals {
  common_tags = {
    app = "newsflow"
    env = var.environment
  }
}

resource "random_string" "uniq" {
  length  = 6
  upper   = false
  numeric = true
  special = false
}

resource "azurerm_resource_group" "rg" {
  name     = "${var.prefix}-rg-${random_string.uniq.result}"
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_container_registry" "acr" {
  name                = "${var.prefix}acr${random_string.uniq.result}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = true
  tags                = local.common_tags
}

resource "azurerm_kubernetes_cluster" "aks" {
  name                = "${var.prefix}-aks-${random_string.uniq.result}"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = "${var.prefix}-dns"

  # Optionally pin version supported in your region:
  # kubernetes_version  = "1.29.7"

  default_node_pool {
    name       = "system"
    node_count = 2
    vm_size    = "Standard_DS2_v2"
    upgrade_settings { max_surge = "33%" }
  }

  identity { type = "SystemAssigned" }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }

  tags = local.common_tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id
  depends_on           = [azurerm_kubernetes_cluster.aks]
}

resource "azurerm_storage_account" "st" {
  name                            = "${var.prefix}st${random_string.uniq.result}" # 3–24 chars, lowercase+digits
  resource_group_name             = azurerm_resource_group.rg.name
  location                        = azurerm_resource_group.rg.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  allow_nested_items_to_be_public = false
  tags                            = local.common_tags
}

resource "azurerm_storage_share" "share_staging" {
  name                 = "newsflow-staging"
  storage_account_name = azurerm_storage_account.st.name
  quota                = 10
}

resource "azurerm_storage_share" "share_prod" {
  name                 = "newsflow-prod"
  storage_account_name = azurerm_storage_account.st.name
  quota                = 10
}
