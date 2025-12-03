use wasm_bindgen::prelude::*;
use url::Url;
use std::collections::HashSet;

/// URL归一化器 - 清洗和去重URL
#[wasm_bindgen]
pub struct UrlNormalizer {
    // 追踪参数黑名单
    tracking_params: HashSet<String>,
}

#[wasm_bindgen]
impl UrlNormalizer {
    /// 创建新的URL归一化器实例
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut tracking_params = HashSet::new();
        
        //常见追踪参数
        let common_trackers = vec![
            "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
            "fbclid", "gclid", "msclkid", "mc_cid", "mc_eid",
            "ref", "referrer", "source", "campaign", "s",
            "_ga", "_gid", "igshid", "ncid",
        ];
        
        for param in common_trackers {
            tracking_params.insert(param.to_string());
        }
        
        Self { tracking_params }
    }
    
    /// 归一化单个URL
    #[wasm_bindgen]
    pub fn normalize(&self, url_str: &str) -> String {
        match self.normalize_internal(url_str) {
            Ok(normalized) => normalized,
            Err(_) => url_str.to_string(),
        }
    }
    
    /// 批量归一化并去重
    #[wasm_bindgen]
    pub fn normalize_batch(&self, urls: Vec<JsValue>) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        
        for url_val in urls {
            if let Some(url_str) = url_val.as_string() {
                let normalized = self.normalize(&url_str);
                if seen.insert(normalized.clone()) {
                    result.push(normalized);
                }
            }
        }
        
        result
    }
    
    /// 批量归一化（返回统计信息）
    #[wasm_bindgen]
    pub fn normalize_batch_with_stats(&self, urls: Vec<JsValue>) -> JsValue {
        let mut seen = HashSet::new();
        let mut result = Vec::new();
        let original_count = urls.len();
        
        for url_val in urls {
            if let Some(url_str) = url_val.as_string() {
                let normalized = self.normalize(&url_str);
                if seen.insert(normalized.clone()) {
                    result.push(normalized);
                }
            }
        }
        
        let unique_count = result.len();
        let duplicate_count = original_count - unique_count;
        
        // 构造返回对象
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"urls".into(), &serde_wasm_bindgen::to_value(&result).unwrap()).unwrap();
        js_sys::Reflect::set(&obj, &"original".into(), &JsValue::from(original_count)).unwrap();
        js_sys::Reflect::set(&obj, &"unique".into(), &JsValue::from(unique_count)).unwrap();
        js_sys::Reflect::set(&obj, &"duplicates".into(), &JsValue::from(duplicate_count)).unwrap();
        
        obj.into()
    }
}

impl UrlNormalizer {
    /// 内部归一化逻辑
    fn normalize_internal(&self, url_str: &str) -> Result<String, url::ParseError> {
        let mut parsed = Url::parse(url_str)?;
        
        // 1. 统一协议为 https
        if parsed.scheme() == "http" {
            let _ = parsed.set_scheme("https");
        }
        
        // 2. 规范化域名
        let normalized_host = match parsed.host_str() {
            Some("twitter.com") | Some("www.twitter.com") | Some("mobile.twitter.com") => Some("x.com"),
            Some("www.reddit.com") | Some("old.reddit.com") | Some("new.reddit.com") => Some("reddit.com"),
            _ => None,
        };
        
        if let Some(new_host) = normalized_host {
            let _ = parsed.set_host(Some(new_host));
        }
        
        // 3. 移除追踪参数
        let clean_query: Vec<(String, String)> = parsed
            .query_pairs()
            .filter(|(key, _)| !self.tracking_params.contains(key.as_ref()))
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect();
        
        if clean_query.is_empty() {
            parsed.set_query(None);
        } else {
            let query_str = clean_query
                .iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect::<Vec<_>>()
                .join("&");
            parsed.set_query(Some(&query_str));
        }
        
        // 4. 移除fragment (锚点)
        parsed.set_fragment(None);
        
        // 5. 移除尾部斜杠
        let path = parsed.path().to_string();
        if path.ends_with('/') && path.len() > 1 {
            parsed.set_path(path.trim_end_matches('/'));
        }
        
        Ok(parsed.to_string())
    }
}
